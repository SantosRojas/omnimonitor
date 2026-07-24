/// Bridge (RPi) registered by IP for WebSocket serial gateway auth.
export interface Bridge {
  id: number;
  ip_address: string;
  label: string | null;
  authorized: boolean;
  status: "online" | "offline";
  last_seen_at: string | null;
  created_at: string;
  updated_at: string | null;
}
