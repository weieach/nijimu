// Shared memory data used across the application

export interface MemoryEvent {
  id: string;
  year: string;
  event: string;
  color: number; // Index into COLORS array
}

export const LIFE_EVENTS: MemoryEvent[] = [
  { id: "0", year: "2003", event: "Born in Beijing", color: 0 },
  { id: "1", year: "2009", event: "First camera", color: 1 },
  { id: "2", year: "2012", event: "The first urge to write a story", color: 2 },
  { id: "3", year: "2016", event: "Wanted to be a fashion designer", color: 3 },
  { id: "4", year: "2017", event: "Read a book that changed my life", color: 4 },
  { id: "5", year: "2020", event: "The year everything slowed down", color: 5 },
  { id: "6", year: "2021", event: "Started designing seriously", color: 6 },
  { id: "7", year: "2021", event: "Wrote something true for the first time", color: 7 },
  { id: "8", year: "2022", event: "Left a place I thought I'd stay longer", color: 8 },
  { id: "9", year: "2023", event: "Started learning to trust my own eye", color: 9 },
  { id: "10", year: "2024", event: "A friendship that quietly ended", color: 0 },
  { id: "11", year: "2024", event: "Showed work I wasn't sure about", color: 1 },
  { id: "12", year: "2024", event: "Met someone through a screen", color: 2 },
  { id: "13", year: "2025", event: "Finding the thread between\npoetry, film, and design", color: 3 },
  { id: "14", year: "2025", event: "Found my muse", color: 4 },
  { id: "15", year: "2026", event: "Still figuring out what love means", color: 5 },
];

export const COLORS = [
  "#9496a6",
  "#D6DADB",
  "#C8D0D4",
  "#CBBFBC",
  "#A4B6BE",
  "#B8969A",
  "#8C9FA8",
  "#6488A0",
  "#9496a6",
  "#1C2C35",
];