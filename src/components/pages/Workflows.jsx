import React, { useState } from 'react'
import WorkflowInstancesList from './workflows/WorkflowInstancesList'
import WorkflowDesigner from './workflows/WorkflowDesigner'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'

export default function Workflows() {
  const [view, setView] = useState('list') // list, designer, definitions_list
  const [editingId, setEditingId] = useState(null)
  const [definitions, setDefinitions] = useState([])
  const [loadingDefs, setLoadingDefs] = useState(false)
  const toast = useToast()

  const loadDefinitions = async () => {
    setLoadingDefs(true)
    try {
      const { data, error } = await db.from('workflow_definitions').select('*').order('created_at', { ascending: false })
      if (!error && data) {
        setDefinitions(data)
      }
    } catch (err) {
      console.error(err)
      toast('Şablon listesi yüklenemedi', 'error')
    } finally {
      setLoadingDefs(false)
    }
  }

  const handleManageDefinitions = () => {
    loadDefinitions()
    setView('definitions_list')
  }

  const handleEditDefinition = (id) => {
    setEditingId(id)
    setView('designer')
  }

  const handleCreateNew = () => {
    setEditingId(null)
    setView('designer')
  }

  const handleArchiveDefinition = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'archived' ? 'published' : 'archived'
    try {
      const { error } = await db.from('workflow_definitions').update({ status: nextStatus }).eq('id', id)
      if (error) throw error
      toast(nextStatus === 'archived' ? 'Şablon arşivlendi' : 'Şablon yayına alındı', 'success')
      loadDefinitions()
    } catch (err) {
      console.error(err)
      toast('İşlem başarısız', 'error')
    }
  }

  if (view === 'designer') {
    return (
      <WorkflowDesigner
        editingId={editingId}
        onBack={() => {
          setEditingId(null)
          if (editingId) {
            handleManageDefinitions()
          } else {
            setView('list')
          }
        }}
      />
    )
  }

  if (view === 'definitions_list') {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-strong)', margin: 0 }}>
              İş Akışı Tanım Şablonları
            </h1>
            <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Süreçlerin onay adımlarını ve koşullarını tasarlayın.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-o" onClick={() => setView('list')} style={{ padding: '8px 14px' }}>
              Taleplere Dön
            </button>
            <button className="btn-p" onClick={handleCreateNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}>
              <i className="fa-solid fa-plus" /> Yeni Akış Tasarla
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          {loadingDefs ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Yükleniyor...</div>
          ) : definitions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              Henüz tanımlanmış bir iş akışı bulunmuyor. Yeni bir tane tasarlayarak başlayın!
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: '.8rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Şablon Adı</th>
                    <th style={{ textAlign: 'left' }}>Açıklama</th>
                    <th style={{ textAlign: 'left' }}>Tip</th>
                    <th style={{ textAlign: 'left' }}>Versiyon</th>
                    <th style={{ textAlign: 'left' }}>Durum</th>
                    <th style={{ width: 180, textAlign: 'right' }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {definitions.map(def => (
                    <tr key={def.id}>
                      <td style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{def.name}</td>
                      <td>{def.description || '-'}</td>
                      <td>
                        <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--text-main)' }}>
                          {def.workflow_type.toUpperCase()}
                        </span>
                      </td>
                      <td>v{def.version}</td>
                      <td>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 99,
                          fontSize: '.7rem',
                          fontWeight: 800,
                          background: def.status === 'published' ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)',
                          color: def.status === 'published' ? '#10b981' : '#64748b'
                        }}>
                          {def.status === 'published' ? 'Yayında' : 'Arşiv'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn-o" style={{ padding: '3px 8px', fontSize: '.72rem' }} onClick={() => handleEditDefinition(def.id)}>
                            Düzenle
                          </button>
                          <button 
                            className="btn-o" 
                            style={{ 
                              padding: '3px 8px', 
                              fontSize: '.72rem',
                              borderColor: def.status === 'published' ? '#ef4444' : '#10b981',
                              color: def.status === 'published' ? '#ef4444' : '#10b981'
                            }} 
                            onClick={() => handleArchiveDefinition(def.id, def.status)}
                          >
                            {def.status === 'published' ? 'Arşivle' : 'Yayına Al'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <WorkflowInstancesList
      onManageDefinitions={handleManageDefinitions}
    />
  )
}
