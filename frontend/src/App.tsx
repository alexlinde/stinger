import { Routes, Route, Link, useLocation } from 'react-router-dom'
import PeopleList from './pages/PeopleList'
import PersonDetail from './pages/PersonDetail'
import TestRecognition from './pages/TestRecognition'
import LiveView from './pages/LiveView'

function App() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-stinger-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-stinger-surface/80 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-lg bg-stinger-accent/20 flex items-center justify-center border border-stinger-accent/50 group-hover:bg-stinger-accent/30 transition-colors">
                <span className="text-stinger-accent text-xl">⚡</span>
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-white">STINGER</h1>
                <p className="text-xs text-stinger-muted">Face Recognition</p>
              </div>
            </Link>

            <nav className="flex items-center gap-2">
              <NavLink to="/" current={location.pathname === '/'}>
                People
              </NavLink>
              <NavLink to="/live" current={location.pathname === '/live'}>
                Live
              </NavLink>
              <NavLink to="/test" current={location.pathname === '/test'}>
                Test
              </NavLink>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<PeopleList />} />
          <Route path="/person/:name" element={<PersonDetail />} />
          <Route path="/live" element={<LiveView />} />
          <Route path="/test" element={<TestRecognition />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center text-stinger-muted text-sm">
          Stinger • Local Face Recognition System
        </div>
      </footer>
    </div>
  )
}

function NavLink({ to, current, children }: { to: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-lg font-medium transition-all ${
        current
          ? 'bg-white/10 text-white'
          : 'text-stinger-muted hover:text-white hover:bg-white/5'
      }`}
    >
      {children}
    </Link>
  )
}

export default App

