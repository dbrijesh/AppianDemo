import { useState, useRef, useEffect } from 'react'
import { Send, Database, Bot, User, Copy, ChevronDown, ChevronUp, Loader2, AlertCircle, ShieldOff } from 'lucide-react'
import { agentApi } from '../../api/client'
import { Button } from '../../design-system'
import { useAuthStore } from '../../stores/auth'
import './DBAgent.css'

// Works on HTTP (no secure-context requirement unlike crypto.randomUUID)
function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

interface QueryResult {
  sql: string
  columns: string[]
  rows: unknown[][]
  row_count: number
  execution_ms: number
  explanation: string
  error: string | null
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  result?: QueryResult
  loading?: boolean
  ts: Date
}

const EXAMPLE_QUESTIONS = [
  'How many tasks are currently open?',
  'List all users and their roles',
  'Show workflow instances started in the last 7 days',
  'Which deviations are still in progress?',
  'What are the top 5 most recent audit events?',
  'Show me tasks that are overdue',
]

function ResultTable({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  if (columns.length === 0) return <p className="db-no-rows">Query returned no rows.</p>
  return (
    <div className="db-table-scroll">
      <table className="db-result-table">
        <thead>
          <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell === null || cell === undefined ? <span className="db-null">null</span> : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AssistantMessage({ msg }: { msg: Message }) {
  const [sqlOpen, setSqlOpen] = useState(false)
  const r = msg.result

  if (msg.loading) {
    return (
      <div className="db-msg db-msg-assistant">
        <div className="db-msg-avatar"><Bot size={16} /></div>
        <div className="db-msg-body">
          <div className="db-thinking"><Loader2 size={14} className="db-spin" /> Thinking…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="db-msg db-msg-assistant">
      <div className="db-msg-avatar"><Bot size={16} /></div>
      <div className="db-msg-body">
        {r?.error ? (
          <div className="db-error">
            <AlertCircle size={14} />
            <span>{r.error}</span>
          </div>
        ) : (
          <>
            {r?.explanation && <p className="db-explanation">{r.explanation}</p>}
            {r && r.columns.length > 0 && (
              <div className="db-result-wrap">
                <div className="db-result-meta">
                  <span>{r.row_count} row{r.row_count !== 1 ? 's' : ''}</span>
                  <span className="db-dot">·</span>
                  <span>{r.execution_ms} ms</span>
                </div>
                <ResultTable columns={r.columns} rows={r.rows} />
              </div>
            )}
            {r && r.columns.length === 0 && !r.error && (
              <p className="db-no-rows">Query returned no rows.</p>
            )}
            {r?.sql && (
              <div className="db-sql-section">
                <button className="db-sql-toggle" onClick={() => setSqlOpen(v => !v)}>
                  {sqlOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  View SQL
                </button>
                {sqlOpen && (
                  <div className="db-sql-block">
                    <button
                      className="db-copy-btn"
                      onClick={() => navigator.clipboard.writeText(r.sql)}
                      title="Copy SQL"
                    >
                      <Copy size={12} />
                    </button>
                    <pre>{r.sql}</pre>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function DBAgent() {
  const { isAdmin } = useAuthStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // All hooks must be called unconditionally before any early return
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!isAdmin()) {
    return (
      <div className="page db-page">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 'var(--space-4)', padding: 'var(--space-12)', textAlign: 'center' }}>
          <ShieldOff size={40} style={{ color: 'var(--color-slate-300)' }} />
          <p style={{ fontWeight: 600, fontSize: 'var(--text-lg)', color: 'var(--color-slate-700)', margin: 0 }}>Admin Access Required</p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-500)', margin: 0 }}>Log in with an admin account to use the DB Query Agent.</p>
        </div>
      </div>
    )
  }

  const send = async (question: string) => {
    const q = question.trim()
    if (!q || loading) return

    const userMsg: Message = { id: uid(), role: 'user', content: q, ts: new Date() }
    const loadingMsg: Message = { id: uid(), role: 'assistant', content: '', loading: true, ts: new Date() }

    setMessages(prev => [...prev, userMsg, loadingMsg])
    setInput('')
    setLoading(true)

    try {
      const result = await agentApi.dbQuery(q)
      setMessages(prev =>
        prev.map(m => m.id === loadingMsg.id
          ? { ...m, loading: false, result }
          : m
        )
      )
    } catch (err: any) {
      setMessages(prev =>
        prev.map(m => m.id === loadingMsg.id
          ? {
              ...m, loading: false,
              result: {
                sql: '', columns: [], rows: [], row_count: 0,
                execution_ms: 0, explanation: '',
                error: err?.message ?? 'Request failed',
              },
            }
          : m
        )
      )
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="page db-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Database size={20} style={{ marginRight: 8, verticalAlign: 'middle', color: 'var(--color-accent)' }} />
            DB Query Agent
          </h1>
          <p className="page-subtitle">Ask questions about platform data in plain English — the AI translates to SQL and runs it live</p>
        </div>
      </div>

      {messages.length === 0 && (
        <div className="db-empty">
          <Bot size={40} style={{ color: 'var(--color-slate-300)', marginBottom: 12 }} />
          <p className="db-empty-title">Ask anything about your data</p>
          <p className="db-empty-sub">The agent has read-only access to tasks, workflows, users, and audit events.<br/>Click any example below or type your own question.</p>
          <div className="db-examples">
            {EXAMPLE_QUESTIONS.map(q => (
              <button key={q} className="db-example-chip" onClick={() => send(q)}>{q}</button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="db-messages">
          {messages.map(msg =>
            msg.role === 'user' ? (
              <div key={msg.id} className="db-msg db-msg-user">
                <div className="db-msg-avatar db-msg-avatar-user"><User size={14} /></div>
                <div className="db-msg-body db-msg-user-body">{msg.content}</div>
              </div>
            ) : (
              <AssistantMessage key={msg.id} msg={msg} />
            )
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="db-input-row">
        <textarea
          ref={textareaRef}
          className="db-textarea"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a question and press Enter (or click Send)…"
          rows={2}
          disabled={loading}
        />
        <Button
          variant="primary"
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          icon={loading ? <Loader2 size={16} className="db-spin" /> : <Send size={16} />}
        >
          {loading ? 'Running…' : 'Send'}
        </Button>
      </div>
    </div>
  )
}
