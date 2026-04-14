export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      indicators: {
        Row: {
          id: string
          name: string
          config: Json
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          config?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          config?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      accounts: {
        Row: {
          id: string
          indicator_id: string
          balance: number
          equity: number
          daily_loss: number
          is_halted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          indicator_id: string
          balance?: number
          equity?: number
          daily_loss?: number
          is_halted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          indicator_id?: string
          balance?: number
          equity?: number
          daily_loss?: number
          is_halted?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      positions: {
        Row: {
          id: string
          indicator_id: string
          side: string
          entry_price: number
          stop_loss: number
          take_profit: number
          size: number
          leverage: number
          status: string
          opened_at: string
          closed_at: string | null
        }
        Insert: {
          id?: string
          indicator_id: string
          side: string
          entry_price: number
          stop_loss: number
          take_profit: number
          size: number
          leverage?: number
          status?: string
          opened_at?: string
          closed_at?: string | null
        }
        Update: {
          id?: string
          indicator_id?: string
          side?: string
          entry_price?: number
          stop_loss?: number
          take_profit?: number
          size?: number
          leverage?: number
          status?: string
          opened_at?: string
          closed_at?: string | null
        }
      }
      trades: {
        Row: {
          id: string
          position_id: string
          pnl: number
          r_multiple: number | null
          duration: number | null
          exit_reason: string
          exited_at: string
        }
        Insert: {
          id?: string
          position_id: string
          pnl: number
          r_multiple?: number | null
          duration?: number | null
          exit_reason: string
          exited_at?: string
        }
        Update: {
          id?: string
          position_id?: string
          pnl?: number
          r_multiple?: number | null
          duration?: number | null
          exit_reason?: string
          exited_at?: string
        }
      }
      performance_metrics: {
        Row: {
          id: string
          indicator_id: string
          total_trades: number
          winrate: number
          profit_factor: number
          max_drawdown: number
          score: number
          updated_at: string
        }
        Insert: {
          id?: string
          indicator_id: string
          total_trades?: number
          winrate?: number
          profit_factor?: number
          max_drawdown?: number
          score?: number
          updated_at?: string
        }
        Update: {
          id?: string
          indicator_id?: string
          total_trades?: number
          winrate?: number
          profit_factor?: number
          max_drawdown?: number
          score?: number
          updated_at?: string
        }
      }
      system_config: {
        Row: {
          id: string
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          value: Json
          updated_at?: string
        }
        Update: {
          id?: string
          key?: string
          value?: Json
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
