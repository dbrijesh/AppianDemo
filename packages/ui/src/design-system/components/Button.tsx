import React from 'react'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: React.ReactNode
}

const styles: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  outline: 'btn-outline',
}

export function Button({ variant = 'primary', size = 'md', loading, icon, children, disabled, className = '', ...rest }: Props) {
  return (
    <button
      className={`btn btn-${size} ${styles[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...rest}
    >
      {loading ? <span className="btn-spinner" aria-hidden /> : icon ? <span className="btn-icon">{icon}</span> : null}
      {children}
    </button>
  )
}
