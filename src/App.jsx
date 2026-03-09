import { useState } from 'react'
import './App.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import '@fortawesome/fontawesome-free/css/all.min.css'

const COLORS = ['#64B5F6', '#81C784', '#FFB74D', '#BA68C8', '#4DD0E1', '#F06292', '#AED581', '#7986CB']

function detectCycle(tasks) {
  const taskNames = new Set(tasks.map(t => t.task))
  
  for (const t of tasks) {
    for (const pred of t.predecessors) {
      if (!taskNames.has(pred)) {
        return `La tâche "${t.task}" dépend de "${pred}" qui n'existe pas`
      }
    }
  }
  
  const inDegree = {}
  tasks.forEach(t => { inDegree[t.task] = t.predecessors.length })
  
  const queue = tasks.filter(t => t.predecessors.length === 0).map(t => t.task)
  const visited = new Set()
  
  while (queue.length > 0) {
    const current = queue.shift()
    if (visited.has(current)) continue
    visited.add(current)
    
    tasks.forEach(t => {
      if (t.predecessors.includes(current)) {
        inDegree[t.task]--
        if (inDegree[t.task] === 0) {
          queue.push(t.task)
        }
      }
    })
  }
  
  if (visited.size !== tasks.length) {
    return "Erreur: Dépendance circulaire détectée"
  }
  
  return null
}

function calculateGantt(tasks) {
  const taskMap = {}
  tasks.forEach(t => { taskMap[t.task] = { ...t } })
  
  const inDegree = {}
  tasks.forEach(t => { inDegree[t.task] = t.predecessors.length })
  
  const ready = tasks.filter(t => t.predecessors.length === 0).map(t => t.task)
  
  const schedule = []
  const completed = {}
  let orderCounter = 1
  
  while (ready.length > 0) {
    const current = ready.shift()
    const task = taskMap[current]
    
    let start = 0
    for (const pred of task.predecessors) {
      if (completed[pred] !== undefined) {
        start = Math.max(start, completed[pred].end)
      }
    }
    
    const end = start + task.duration
    completed[current] = { task: current, name: task.name || current, start, end, duration: task.duration, order: orderCounter++ }
    schedule.push(completed[current])
    
    tasks.forEach(t => {
      if (t.predecessors.includes(current)) {
        inDegree[t.task]--
        if (inDegree[t.task] === 0) {
          ready.push(t.task)
        }
      }
    })
  }
  
  schedule.forEach(item => {
    item.earliestStart = item.start
  })
  
  const projectEnd = Math.max(...schedule.map(s => s.end))
  
  const successorsMap = {}
  tasks.forEach(t => { successorsMap[t.task] = [] })
  tasks.forEach(t => {
    t.predecessors.forEach(pred => {
      if (successorsMap[pred]) {
        successorsMap[pred].push(t.task)
      }
    })
  })
  
  schedule.forEach(item => {
    item.latestStart = projectEnd - item.duration
  })
  
  let changed = true
  while (changed) {
    changed = false
    schedule.forEach(item => {
      const successors = successorsMap[item.task] || []
      if (successors.length > 0) {
        let minLatestStart = projectEnd
        successors.forEach(succ => {
          const succItem = schedule.find(s => s.task === succ)
          if (succItem && succItem.latestStart < minLatestStart) {
            minLatestStart = succItem.latestStart
          }
        })
        if (minLatestStart - item.duration !== item.latestStart) {
          item.latestStart = minLatestStart - item.duration
          changed = true
        }
      }
    })
  }
  
  schedule.forEach(item => {
    item.margin = item.latestStart - item.earliestStart
  })
  
  schedule.forEach(item => {
    const successors = successorsMap[item.task] || []
    if (successors.length > 0) {
      let minSuccEarliestStart = projectEnd
      successors.forEach(succ => {
        const succItem = schedule.find(s => s.task === succ)
        if (succItem) {
          minSuccEarliestStart = Math.min(minSuccEarliestStart, succItem.earliestStart)
        }
      })
      item.freeMargin = minSuccEarliestStart - item.end
    } else {
      item.freeMargin = item.margin
    }
  })
  
  schedule.forEach(item => {
    item.isCritical = item.margin === 0
  })
  
  return schedule.sort((a, b) => a.task.localeCompare(b.task))
}

function App() {
  const [tasks, setTasks] = useState([
    { id: 1, task: '', name: '', duration: '', predecessors: '' },
    { id: 2, task: '', name: '', duration: '', predecessors: '' },
    { id: 3, task: '', name: '', duration: '', predecessors: '' }
  ])
  const [schedule, setSchedule] = useState([])
  const [currentStep, setCurrentStep] = useState(-1)
  const [error, setError] = useState(null)
  const [inputMode, setInputMode] = useState('predecessors')
  const [savedConfigs, setSavedConfigs] = useState(() => {
    const saved = localStorage.getItem('ganttConfigs')
    return saved ? JSON.parse(saved) : []
  })

  const addTask = () => {
    setTasks([...tasks, { id: Date.now(), task: '', name: '', duration: '', predecessors: '' }])
  }

  const removeTask = (id) => {
    if (tasks.length > 1) {
      setTasks(tasks.filter(t => t.id !== id))
    }
  }

  const updateTask = (id, field, value) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  const calculateSchedule = () => {
    const validTasks = tasks
      .filter(t => t.task && t.duration)
      .map(t => ({
        task: t.task.toUpperCase().trim(),
        name: t.name || t.task.toUpperCase().trim(),
        duration: parseInt(t.duration),
        predecessors: t.predecessors ? t.predecessors.split(',').map(p => p.trim().toUpperCase()).filter(p => p && p !== '-') : []
      }))

    if (validTasks.length === 0) {
      setError('Veuillez entrer au moins une tâche avec un nom et une durée')
      return
    }

    const cycleError = detectCycle(validTasks)
    if (cycleError) {
      setError(cycleError)
      return
    }

    const result = calculateGantt(validTasks)
    
    if (result.length !== validTasks.length) {
      setError("Erreur: Dépendance circulaire détectée - impossible de planifier toutes les tâches")
      return
    }
    
    setSchedule(result)
    setCurrentStep(-1)
    setError(null)
  }

  const saveConfig = () => {
    const name = prompt('Nom de la configuration à sauvegarder:')
    if (!name) return
    
    const validTasks = tasks.filter(t => t.task && t.duration)
    if (validTasks.length === 0) {
      alert('Aucune tâche à sauvegarder')
      return
    }
    
    const newConfig = {
      id: Date.now(),
      name,
      tasks: [...tasks]
    }
    const updatedConfigs = [...savedConfigs, newConfig]
    setSavedConfigs(updatedConfigs)
    localStorage.setItem('ganttConfigs', JSON.stringify(updatedConfigs))
    alert(`Configuration "${name}" sauvegardée!`)
  }

  const loadConfig = (configId) => {
    const config = savedConfigs.find(c => c.id === configId)
    if (config) {
      setTasks(config.tasks.map((t, idx) => ({ ...t, id: Date.now() + idx })))
      setSchedule([])
      setCurrentStep(-1)
    }
  }

  const deleteConfig = (configId) => {
    const updatedConfigs = savedConfigs.filter(c => c.id !== configId)
    setSavedConfigs(updatedConfigs)
    localStorage.setItem('ganttConfigs', JSON.stringify(updatedConfigs))
  }

  const prevStep = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  const nextStep = () => {
    if (currentStep < schedule.length - 1) setCurrentStep(currentStep + 1)
  }

  const calculateSuccessors = () => {
    if (schedule.length === 0) return []
    
    const successorsMap = {}
    schedule.forEach(item => {
      successorsMap[item.task] = []
    })
    
    const validTasks = tasks
      .filter(t => t.task && t.duration)
      .map(t => ({
        task: t.task.toUpperCase().trim(),
        predecessors: t.predecessors ? t.predecessors.split(',').map(p => p.trim().toUpperCase()).filter(p => p && p !== '-') : []
      }))
    
    validTasks.forEach(t => {
      t.predecessors.forEach(pred => {
        if (successorsMap[pred]) {
          successorsMap[pred].push(t.task)
        }
      })
    })
    
    return schedule.map(item => ({
      task: item.task,
      duration: item.duration,
      successors: successorsMap[item.task] || []
    }))
  }

  const successorData = calculateSuccessors()
  const maxTime = schedule.length > 0 ? Math.max(...schedule.map(s => s.end)) : 10

  return (
    <div className="app">
      <nav className="navbar">
        <div className="container">
          <span className="navbar-brand">
            <i className="fas fa-project-diagram me-2"></i>GanttRO
          </span>
          <span className="navbar-text">Ordonnancement de Tâches</span>
        </div>
      </nav>

      <div className="container main-container">
        <div className="card">
          <div className="card-header">
            <i className="fas fa-tasks me-2"></i>Tableau des Tâches
            <p className="subtitle mb-0 mt-1">Définissez vos tâches avec leurs durées et dépendances</p>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-header">
                  <tr>
                    <th style={{minWidth: '140px'}}>Propriété</th>
                    {tasks.map((t, idx) => (
                      <th key={t.id} className="text-center" style={{minWidth: '120px'}}>
                        <span className="me-2">Tâche {String.fromCharCode(65 + idx)}</span>
                        <button className="btn btn-sm btn-remove p-0" style={{width: '24px', height: '24px', lineHeight: '1'}} onClick={() => removeTask(t.id)}>
                          <i className="fas fa-times"></i>
                        </button>
                      </th>
                    ))}
                    <th style={{minWidth: '60px'}}>
                      <button className="btn btn-add btn-sm" onClick={addTask}>
                        <i className="fas fa-plus"></i>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="table-header">Tâche</td>
                    {tasks.map(t => (
                      <td key={t.id}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="A"
                          maxLength={1}
                          value={t.task}
                          onChange={e => updateTask(t.id, 'task', e.target.value.toUpperCase())}
                        />
                      </td>
                    ))}
                    <td></td>
                  </tr>
                  <tr>
                    <td className="table-header">Durée</td>
                    {tasks.map(t => (
                      <td key={t.id}>
                        <input
                          type="number"
                          className="form-control"
                          placeholder="Durée"
                          min={1}
                          value={t.duration}
                          onChange={e => updateTask(t.id, 'duration', e.target.value)}
                        />
                      </td>
                    ))}
                    <td></td>
                  </tr>
                  <tr>
                    <td className="table-header">
                      Tâches Antérieures
                      <small className="d-block text-muted" style={{fontSize: '0.7rem'}}>Séparées par virgule</small>
                    </td>
                    {tasks.map(t => (
                      <td key={t.id}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Ex: A, B"
                          value={t.predecessors}
                          onChange={e => updateTask(t.id, 'predecessors', e.target.value.toUpperCase())}
                        />
                      </td>
                    ))}
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="card-footer d-flex justify-content-between">
            <div>
              {schedule.length > 0 && (
                <button 
                  className={`btn ${inputMode === 'predecessors' ? 'btn-info' : 'btn-outline-info'}`}
                  onClick={() => setInputMode(inputMode === 'predecessors' ? 'successors' : 'predecessors')}
                >
                  <i className="fas fa-exchange-alt me-2"></i>
                  {inputMode === 'predecessors' ? 'Passer aux Successeurs' : 'Retour aux Prédécesseurs'}
                </button>
              )}
            </div>
            <div>
              <button className="btn btn-outline-secondary me-2" onClick={saveConfig}>
                <i className="fas fa-save me-2"></i>Sauvegarder
              </button>
              {savedConfigs.length > 0 && (
                <div className="btn-group me-2">
                  <button className="btn btn-outline-primary dropdown-toggle" data-bs-toggle="dropdown">
                    <i className="fas fa-folder-open me-2"></i>Charger
                  </button>
                  <ul className="dropdown-menu">
                    {savedConfigs.map(config => (
                      <li key={config.id}>
                        <a className="dropdown-item d-flex justify-content-between align-items-center" href="#" onClick={(e) => { e.preventDefault(); loadConfig(config.id); }}>
                        {config.name}
                        <span className="btn btn-sm btn-outline-danger ms-2" onClick={(e) => { e.stopPropagation(); deleteConfig(config.id); }}>
                          <i className="fas fa-trash"></i>
                        </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button className="btn btn-success btn-lg" onClick={calculateSchedule}>
                <i className="fas fa-calculator me-2"></i>Calculer le diagramme
              </button>
            </div>
          </div>
        </div>

        {inputMode === 'successors' && schedule.length > 0 && (
          <div className="card">
            <div className="card-header">
              <i className="fas fa-random me-2"></i>Tableau des Tâches Successeurs
              <p className="subtitle mb-0 mt-1">Résultats basés sur l'ordonnancement obtenu</p>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-header">
                    <tr>
                      <th style={{minWidth: '140px'}}>Propriété</th>
                      {successorData.map((t, idx) => (
                        <th key={idx} className="text-center" style={{minWidth: '100px'}}>Tâche {t.task}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="table-header">Durée</td>
                      {successorData.map((t, idx) => (
                        <td key={idx} className="text-center">{t.duration}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="table-header">
                        Successeurs
                        <small className="d-block text-muted" style={{fontSize: '0.7rem'}}>Tâches dépendantes</small>
                      </td>
                      {successorData.map((t, idx) => (
                        <td key={idx} style={{ textAlign: 'center', color: '#E53935' }}>{t.successors.length > 0 ? t.successors.join(', ') : 'Fin'}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-danger">
            <i className="fas fa-exclamation-triangle me-2"></i>{error}
          </div>
        )}

        {schedule.length > 0 && (
          <div className="card">
            <div className="card-header">
              <i className="fas fa-chart-bar me-2"></i>Diagramme de Gantt
            </div>
            <div className="card-body">
              <div className="step-indicator">
                <button className="btn btn-primary" onClick={prevStep} disabled={currentStep === 0}>
                  <i className="fas fa-chevron-left me-1"></i> Précédent
                </button>
                <span className="current-step">
                  <i className="fas fa-play-circle me-2"></i>Étape {currentStep + 1} / {schedule.length}
                </span>
                <button className="btn btn-orange" onClick={nextStep} disabled={currentStep >= schedule.length - 1}>
                  Suivant <i className="fas fa-chevron-right ms-1"></i>
                </button>
              </div>

              <div className="gantt-container">
                <div className="time-axis">
                  {Array.from({ length: maxTime + 1 }, (_, i) => (
                    <div key={i} className="time-unit">{i}</div>
                  ))}
                </div>
                
                {(() => {
                  const criticalTasks = schedule.filter(t => t.isCritical)
                  const criticalOrder = []
                  
                  schedule.forEach(item => {
                    if (item.isCritical) {
                      const preds = tasks.find(t => t.task.toUpperCase() === item.task)?.predecessors || ''
                      const predList = preds.split(',').map(p => p.trim().toUpperCase()).filter(p => p)
                      const hasCriticalPred = predList.some(pred => 
                        criticalTasks.some(ct => ct.task === pred)
                      )
                      if (!hasCriticalPred || criticalOrder.length === 0) {
                        if (criticalOrder.length === 0 || !criticalOrder.includes(item.task)) {
                          criticalOrder.push(item.task)
                        }
                      }
                    }
                  })
                  
                  criticalTasks.forEach(ct => {
                    if (!criticalOrder.includes(ct.task)) {
                      criticalOrder.push(ct.task)
                    }
                  })
                  
                  return schedule.map((item, idx) => {
                    const currentCriticalIdx = criticalOrder.indexOf(item.task)
                    const nextCriticalTask = currentCriticalIdx >= 0 && currentCriticalIdx < criticalOrder.length - 1 
                      ? criticalTasks.find(t => t.task === criticalOrder[currentCriticalIdx + 1])
                      : null
                    
                    const showArrow = item.isCritical && nextCriticalTask
                    
                    return (
                      <div className="gantt-row" key={item.task}>
  <div className="gantt-label">Tâche {item.task}</div>
  <div className="gantt-bar-container">
    
    {/* On affiche la barre UNIQUEMENT si l'étape actuelle est supérieure ou égale à l'index */}
    {currentStep >= idx && (
      <div
        className={`gantt-bar executed ${idx === currentStep ? 'current' : ''} ${item.isCritical ? 'critical' : ''}`}
        style={{
          left: `${(item.start / maxTime) * 100}%`,
          width: `${(item.duration / maxTime) * 100}%`,
          backgroundColor: item.isCritical ? '#E53935' : '#2196F3',
          opacity: 1, // La barre est pleine dès qu'elle apparaît
          border: item.isCritical ? '2px solid #B71C1C' : '2px solid rgba(0,0,0,0.2)',
          boxShadow: idx === currentStep ? '0 0 0 3px rgba(33, 150, 243, 0.5)' : 'none',
          transition: 'all 0.4s ease-out' // Optionnel : pour une apparition fluide
        }}
      >
        {item.start}-{item.end}
      </div>
    )}

    {/* La flèche ne s'affiche aussi que si la barre est visible */}
    {showArrow && currentStep >= idx && nextCriticalTask && (
      <div className="critical-arrow-line" style={{
        left: `${(item.end / maxTime) * 100}%`,
        width: `${(nextCriticalTask.start - item.end) / maxTime * 100}%`
      }}>
        <span className="arrow-head">→</span>
      </div>
    )}
    
  </div>
</div>
                    )
                  })
                })()}
              </div>

              {currentStep >= 0 && (
                <div className="results-table mt-4">
                  <h5><i className="fas fa-table me-2"></i>Tableau des Résultats</h5>
                  <div className="table-responsive">
                    <table className="table table-bordered table-sm mt-2">
                      <tbody>
                        {['Tâche', 'Désignation', 'Durée', 'Début au plus tôt', 'Fin au plus tôt', 'Début au plus tard', 'Fin au plus tard', 'Marge Totale', 'Marge Libre', 'Chemin critique'].map((header, rowIdx) => (
                          <tr key={rowIdx}>
                            <th className="table-header" style={{minWidth: '120px'}}>{header}</th>
                            {schedule.map((item, colIdx) => {
                              const values = [item.task, item.name, item.duration, item.earliestStart, item.end, item.latestStart, item.latestStart + item.duration, item.margin, item.freeMargin, item.isCritical ? 'Oui' : 'Non']
                              const isCritical = rowIdx === 9 && item.isCritical
                              return (
                                <td key={colIdx} className={isCritical ? 'critical-cell' : ''} style={isCritical ? {backgroundColor: '#FFEBEE', fontWeight: 'bold'} : {}}>
                                  {values[rowIdx]}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {currentStep >= 0 && (
                <div className="margin-chart mt-4">
                  <h5><i className="fas fa-chart-bar me-2"></i>Diagramme des Marges</h5>
                  <div className="margin-bars mt-3">
                    {schedule.map((item, idx) => (
                      <div className="margin-row" key={idx}>
                        <div className="margin-label">Tâche {item.task}</div>
                        <div className="margin-bar-container">
                          <div className="margin-bar total-margin" style={{ width: `${(item.margin / maxTime) * 100}%` }}>
                            <span>{item.margin}</span>
                          </div>
                          <div className="margin-bar free-margin" style={{ width: `${(item.freeMargin / maxTime) * 100}%` }}>
                            <span>{item.freeMargin}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="margin-legend mt-3">
                    <div className="legend-item">
                      <div className="legend-box" style={{ backgroundColor: '#1E88E5' }}></div>
                      <span>Marge Totale</span>
                    </div>
                    <div className="legend-item">
                      <div className="legend-box" style={{ backgroundColor: '#43A047' }}></div>
                      <span>Marge Libre</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="legend">
                <div className="legend-item">
                  <div className="legend-box" style={{ backgroundColor: '#E53935' }}></div>
                  <span>Chemin critique</span>
                </div>
                <div className="legend-item">
                  <div className="legend-box" style={{ backgroundColor: COLORS[0], opacity: 1 }}></div>
                  <span>Tâche exécutée</span>
                </div>
                <div className="legend-item">
                  <div className="legend-box" style={{ backgroundColor: COLORS[0], opacity: 1, boxShadow: '0 0 0 3px rgba(33, 150, 243, 0.5)' }}></div>
                  <span>Tâche en cours</span>
                </div>
                <div className="legend-item">
                  <div className="legend-box" style={{ backgroundColor: '#BDBDBD' }}></div>
                  <span>Tâche non exécutée</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
