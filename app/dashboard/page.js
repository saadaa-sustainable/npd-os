'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import { getDashboardStats, getStyles, STAGES } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'

const STAGE_COLORS = ['#4dabf7','#cc5de8','#ffd43b','#ff6b35','#69db7c']

export default function DashboardPage() {
  const user    = useRequireAuth(['founder','viewer'])
  const router  = useRouter()
  const [stats, setStats]   = useState(null)
  const [recent, setRecent] = useState([])
  const [pending, setPending] = useState([])

  useEffect(() => {
    if (!user) return
    Promise.all([
      getDashboardStats(),
      getStyles({ approval_status: 'pending' }),
      getStyles(),
    ]).then(([s, pend, all]) => {
      setStats(s)
      setPending(pend.slice(0,5))
      setRecent(all.slice(0,8))
    })
  }, [user])

  if (!user || !stats) return (
    <AppShell title="Overview" subtitle="Loading…">
      <div className="spinner-wrap"><div className="spinner"/></div>
    </AppShell>
  )

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const stageChartData = STAGES.map((s,i) => ({
    name: s.split(' ')[0],
    count: stats.stageCounts[s] || 0,
    color: STAGE_COLORS[i],
  }))

  const seasonChartData = Object.entries(stats.seasonCounts)
    .sort((a,b) => b[1]-a[1]).slice(0,8)
    .map(([name, count]) => ({ name, count }))

  const genderData = Object.entries(stats.genderCounts)
    .filter(([,v]) => v > 0)
    .map(([name, value]) => ({ name, value }))

  const STAGE_BADGE = {
    'Style Creation':'badge-blue','Silhouette Approval':'badge-purple',
    'Fit Check':'badge-yellow','RFP':'badge-orange','Inventory Planning':'badge-green',
  }

  return (
    <AppShell title="Overview" subtitle="SAADAA NPD pipeline at a glance">
      <div style={{ marginBottom: 24 }}>
        <div className="page-title" style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
          {greeting}, {user.full_name?.split(' ')[0] || 'there'} 👋
        </div>
        <div style={{ fontSize: 13, color: 'var(--t3)' }}>
          {stats.total} styles across {Object.keys(stats.seasonCounts).length} seasons · {stats.pending} pending approval
        </div>
      </div>

      {/* Stage stat cards */}
      <div className="g-5" style={{ marginBottom: 24 }}>
        {STAGES.map((stage, i) => (
          <div key={stage} className={`stat-card c-${['blue','purple','yellow','orange','green'][i]}`}
            onClick={() => router.push(`/styles?stage=${encodeURIComponent(stage)}`)}>
            <div className="stat-label">{stage.split(' ')[0]}</div>
            <div className="stat-value">{stats.stageCounts[stage] || 0}</div>
            <div className="stat-sub">styles</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="g-2" style={{ marginBottom: 24 }}>
        {/* Pipeline bar chart */}
        <div className="card">
          <div className="card-header"><div className="card-title">Pipeline Distribution</div></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stageChartData} barSize={32}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--t1)', fontFamily: 'var(--font-body)' }}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="count" radius={[4,4,0,0]}>
                  {stageChartData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Season + Gender */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Gender pie */}
          <div className="card" style={{ flex: 1 }}>
            <div className="card-header"><div className="card-title">Gender Split</div></div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} paddingAngle={3}>
                    {genderData.map((_, i) => <Cell key={i} fill={['#cc5de8','#4dabf7','#69db7c'][i]} fillOpacity={0.85} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--t1)' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--t2)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Season breakdown */}
          {seasonChartData.length > 0 && (
            <div className="card" style={{ flex: 1 }}>
              <div className="card-header"><div className="card-title">By Season / Drop</div></div>
              <div className="card-body" style={{ maxHeight: 160, overflowY: 'auto' }}>
                {seasonChartData.map(({ name, count }) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--t2)' }}>{name}</div>
                    <div style={{ flex: 2 }}>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${Math.round((count / stats.total) * 100)}%` }} />
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t3)', width: 20, textAlign: 'right' }}>{count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Pending approvals + Recent activity */}
      <div className="g-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">⏳ Pending Approvals</div>
            <a href="/approvals" className="btn btn-ghost btn-xs">View all →</a>
          </div>
          <div className="card-body">
            {pending.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div className="empty-icon">✅</div>
                <div className="empty-text">No pending approvals</div>
              </div>
            ) : pending.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-dim)', cursor: 'pointer' }}
                onClick={() => router.push('/approvals')}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{s.stage} · {s.maker?.full_name || '—'}</div>
                </div>
                <span className={`badge ${STAGE_BADGE[s.stage] || 'badge-grey'}`} style={{ fontSize: 10 }}>{s.stage.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">🕐 Recent Styles</div>
            <a href="/styles" className="btn btn-ghost btn-xs">View all →</a>
          </div>
          <div className="card-body">
            {recent.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-dim)', cursor: 'pointer' }}
                onClick={() => router.push('/styles')}>
                <span className="td-code" style={{ fontSize: 10, padding: '2px 6px' }}>{s.style_code || '—'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{s.gender} · {s.category}</div>
                </div>
                <span className={`badge ${STAGE_BADGE[s.stage] || 'badge-grey'}`} style={{ fontSize: 10 }}>{s.stage.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
