export type MatchStatus = 'Confirmado' | 'Aberto' | 'Finalizado';
export type PlayerStatus = 'Confirmado' | 'Duvida';

export type Match = {
  id: string;
  title: string;
  dateLabel: string;
  location: string;
  notes: string;
  status: MatchStatus;
  confirmedPlayers: number;
  capacity: number;
  score?: string;
};

export type Player = {
  id: string;
  name: string;
  nickname: string;
  position: string;
  status: PlayerStatus;
  goals: number;
  assists: number;
  rating: number;
  note: string;
};

export const dashboardHighlights = [
  { label: 'Media de presenca', value: '13' },
  { label: 'Retrospecto', value: '7V 1E 2D' },
  { label: 'Caixa da rodada', value: 'R$ 280' },
];

export const weeklyChecklist = [
  {
    title: 'Fechar confirmacao ate terca 22h',
    description: 'A base ja mostra vagas restantes para facilitar o fechamento dos times sem correria.',
  },
  {
    title: 'Separar coletes e pix da quadra',
    description: 'Esse fluxo pode virar um modulo simples de check-in e pagamento na proxima iteracao.',
  },
  {
    title: 'Registrar placar e MVP',
    description: 'Os dados de jogo podem alimentar ranking individual e historico da temporada.',
  },
];

export const matches: Match[] = [
  {
    id: 'match-1',
    title: 'Rodada 11',
    dateLabel: 'Quarta, 25 mar • 20h30',
    location: 'Arena Grajau • Quadra 2',
    notes: 'Confirmacao aberta ate 18h. Levar camisa branca ou verde.',
    status: 'Confirmado',
    confirmedPlayers: 12,
    capacity: 14,
  },
  {
    id: 'match-2',
    title: 'Rodada 12',
    dateLabel: 'Quarta, 1 abr • 20h30',
    location: 'Arena Grajau • Quadra 2',
    notes: 'Partida reservada, aguardando definicao da lista de espera.',
    status: 'Aberto',
    confirmedPlayers: 8,
    capacity: 14,
  },
  {
    id: 'match-3',
    title: 'Rodada 10',
    dateLabel: 'Quarta, 18 mar • 20h30',
    location: 'Arena Grajau • Quadra 1',
    notes: 'Jogo intenso com virada no segundo tempo e duas assistencias do Leo.',
    status: 'Finalizado',
    confirmedPlayers: 14,
    capacity: 14,
    score: '6 x 4',
  },
];

export const players: Player[] = [
  {
    id: 'player-1',
    name: 'Leonardo Torres',
    nickname: 'Leo',
    position: 'Ala direita',
    status: 'Confirmado',
    goals: 5,
    assists: 4,
    rating: 8.9,
    note: 'Chega cedo e costuma organizar os times.',
  },
  {
    id: 'player-2',
    name: 'Rafael Nogueira',
    nickname: 'Rafa',
    position: 'Pivo',
    status: 'Confirmado',
    goals: 7,
    assists: 2,
    rating: 8.7,
    note: 'Boa referencia para segurar a bola e finalizar de primeira.',
  },
  {
    id: 'player-3',
    name: 'Matheus Carvalho',
    nickname: 'Maca',
    position: 'Fixo',
    status: 'Confirmado',
    goals: 2,
    assists: 5,
    rating: 8.4,
    note: 'Equilibra bem a saida e faz cobertura curta.',
  },
  {
    id: 'player-4',
    name: 'Bruno Freitas',
    nickname: 'Bf',
    position: 'Goleiro linha',
    status: 'Duvida',
    goals: 1,
    assists: 1,
    rating: 7.8,
    note: 'Ainda depende de liberar o horario no trabalho.',
  },
  {
    id: 'player-5',
    name: 'Caio Mendes',
    nickname: 'Caio',
    position: 'Ala esquerda',
    status: 'Confirmado',
    goals: 4,
    assists: 3,
    rating: 8.2,
    note: 'Tem aceleracao boa para puxar contra-ataque.',
  },
  {
    id: 'player-6',
    name: 'Thiago Santos',
    nickname: 'Thi',
    position: 'Fixo',
    status: 'Duvida',
    goals: 2,
    assists: 2,
    rating: 7.6,
    note: 'Costuma confirmar em cima da hora, mas raramente falta.',
  },
];

export const roadmapItems = [
  {
    title: '1. Persistir dados reais',
    description: 'Trocar os mocks por AsyncStorage ou Supabase para manter elenco, jogos e presencas.',
  },
  {
    title: '2. Criar formulario de confirmacao',
    description: 'Adicionar tela para o jogador marcar presenca, status e observacoes da rodada.',
  },
  {
    title: '3. Montar times automaticamente',
    description: 'Usar nota, posicao e presenca para sugerir times mais equilibrados.',
  },
];
