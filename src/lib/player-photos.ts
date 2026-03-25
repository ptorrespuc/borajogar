import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { supabase } from "@/src/lib/supabase";

const PLAYER_PHOTO_BUCKET = "account-player-photos";
const PLAYER_PHOTO_SIZE = 500;
const PLAYER_PHOTO_CACHE_CONTROL = "3600";
const PLAYER_PHOTO_PUBLIC_SEGMENT = `/storage/v1/object/public/${PLAYER_PHOTO_BUCKET}/`;

export type PreparedPlayerPhoto = {
  uri: string;
  base64: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
};

function buildSquareCrop(width: number, height: number) {
  if (width === height) {
    return null;
  }

  const size = Math.min(width, height);
  return {
    originX: Math.floor((width - size) / 2),
    originY: Math.floor((height - size) / 2),
    width: size,
    height: size,
  };
}

function buildPhotoObjectPath(accountId: string, playerId: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${accountId}/${playerId}/${suffix}.jpg`;
}

function extractManagedPhotoPath(photoUrl: string | null | undefined) {
  if (!photoUrl) {
    return null;
  }

  try {
    const url = new URL(photoUrl);
    const publicPathIndex = url.pathname.indexOf(PLAYER_PHOTO_PUBLIC_SEGMENT);

    if (publicPathIndex === -1) {
      return null;
    }

    return decodeURIComponent(url.pathname.slice(publicPathIndex + PLAYER_PHOTO_PUBLIC_SEGMENT.length));
  } catch {
    return null;
  }
}

export function isManagedPlayerPhotoUrl(photoUrl: string | null | undefined) {
  return Boolean(extractManagedPhotoPath(photoUrl));
}

export async function pickAndPreparePlayerPhoto(): Promise<PreparedPlayerPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error("Permita o acesso a galeria para escolher a foto do jogador.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  const crop = buildSquareCrop(asset.width, asset.height);

  if (crop) {
    context.crop(crop);
  }

  context.resize({
    width: PLAYER_PHOTO_SIZE,
    height: PLAYER_PHOTO_SIZE,
  });

  const renderedImage = await context.renderAsync();
  const processedImage = await renderedImage.saveAsync({
    base64: true,
    compress: 0.82,
    format: SaveFormat.JPEG,
  });

  if (!processedImage.base64) {
    throw new Error("Nao foi possivel preparar a foto do jogador.");
  }

  return {
    uri: processedImage.uri,
    base64: processedImage.base64,
    mimeType: "image/jpeg",
    width: PLAYER_PHOTO_SIZE,
    height: PLAYER_PHOTO_SIZE,
  };
}

export async function uploadPreparedPlayerPhoto(input: {
  accountId: string;
  playerId: string;
  preparedPhoto: PreparedPlayerPhoto;
  existingPhotoUrl?: string | null;
}) {
  const objectPath = buildPhotoObjectPath(input.accountId, input.playerId);

  const { error: uploadError } = await supabase.storage
    .from(PLAYER_PHOTO_BUCKET)
    .upload(objectPath, decode(input.preparedPhoto.base64), {
      cacheControl: PLAYER_PHOTO_CACHE_CONTROL,
      contentType: input.preparedPhoto.mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(PLAYER_PHOTO_BUCKET).getPublicUrl(objectPath);

  if (!data.publicUrl) {
    throw new Error("Nao foi possivel obter a URL publica da foto do jogador.");
  }

  if (input.existingPhotoUrl && input.existingPhotoUrl !== data.publicUrl) {
    await deleteManagedPlayerPhoto(input.existingPhotoUrl);
  }

  return data.publicUrl;
}

export async function deleteManagedPlayerPhoto(photoUrl: string | null | undefined) {
  const objectPath = extractManagedPhotoPath(photoUrl);

  if (!objectPath) {
    return;
  }

  const { error } = await supabase.storage.from(PLAYER_PHOTO_BUCKET).remove([objectPath]);

  if (error) {
    console.warn("Nao foi possivel remover a foto anterior do jogador.", error.message);
  }
}
