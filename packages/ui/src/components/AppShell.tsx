import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, CheckSquare, BarChart2, Award,
  Workflow, LogOut, ChevronLeft, ChevronRight,
  AlertTriangle, Package, Users, ShieldCheck, Database, Bot, Zap, GitBranch
} from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import './AppShell.css'

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
  roles?: string[]
}

const NAV: NavItem[] = [
  { to: '/',              icon: <LayoutDashboard size={18} />, label: 'Home' },
  { to: '/tasks',         icon: <CheckSquare size={18} />,      label: 'My Tasks' },
  { to: '/workflows',     icon: <GitBranch size={18} />,        label: 'Workflows' },
  { to: '/mr',            icon: <Package size={18} />,          label: 'Material Requisition' },
  { to: '/certificates',  icon: <Award size={18} />,            label: 'Certificates' },
  { to: '/deviations',    icon: <AlertTriangle size={18} />,    label: 'Deviations & CAPA' },
  { to: '/reports',       icon: <BarChart2 size={18} />,        label: 'Reports' },
]

const ADMIN_NAV: NavItem[] = [
  { to: '/admin/workflows', icon: <Workflow size={18} />,   label: 'Workflow Designer' },
  { to: '/admin/users',     icon: <Users size={18} />,      label: 'User Management' },
  { to: '/admin/audit',     icon: <ShieldCheck size={18} />, label: 'Audit Log' },
  { to: '/admin/db-agent',  icon: <Database size={18} />,   label: 'DB Query Agent' },
  { to: '/admin/agent-builder', icon: <Bot size={18} />,      label: 'Agent Builder' },
  { to: '/admin/agents',    icon: <Zap size={18} />,        label: 'Agent Playground' },
]

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, clearAuth, isAdmin } = useAuthStore()
  const navigate = useNavigate()

  const logout = () => { clearAuth(); navigate('/login') }

  return (
    <div className={`shell ${collapsed ? 'shell-collapsed' : ''}`}>
      <nav className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">
          <span className="brand-mark">MGP</span>
          {!collapsed && (
            <div className="brand-name">
              <span className="brand-title">HexaMGP</span>
              <span className="brand-subtitle">Governance Platform</span>
            </div>
          )}
        </div>

        <div className="sidebar-nav">
          <span className="nav-section-label">{collapsed ? '' : 'Main'}</span>
          {NAV.map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}

          {isAdmin() && (
            <>
              <span className="nav-section-label">{collapsed ? '' : 'Admin'}</span>
              {ADMIN_NAV.map(item => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
                  <span className="nav-icon">{item.icon}</span>
                  {!collapsed && <span className="nav-label">{item.label}</span>}
                </NavLink>
              ))}
            </>
          )}
        </div>

        <div className="sidebar-footer">
          {!collapsed && user && (
            <div className="user-info">
              <div className="user-avatar">{user.email[0].toUpperCase()}</div>
              <div className="user-meta">
                <div className="user-name">{user.full_name || user.email}</div>
                <div className="user-role">{user.roles[0]}</div>
              </div>
            </div>
          )}
          <button className="nav-item" onClick={logout} aria-label="Sign out">
            <span className="nav-icon"><LogOut size={18} /></span>
            {!collapsed && <span className="nav-label">Sign out</span>}
          </button>
          <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
