import { useCallback, useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import './App.css'

type OptionKey = 'A' | 'B' | 'C' | 'D'

type Question = {
  id: string
  question: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: OptionKey
  explanation: string
  topic: string
  difficulty: string
}

type CsvSource = {
  path: string
  label: string
}

const CSV_SOURCES: CsvSource[] = [
  { path: '/qcm_genie_logiciel_520_final.csv', label: 'lot520' },
  { path: '/qcm_genie_logiciel_plus_2500_final.csv', label: 'lot2500' },
]
const OPTION_MAP: Record<OptionKey, 'option_a' | 'option_b' | 'option_c' | 'option_d'> = {
  A: 'option_a',
  B: 'option_b',
  C: 'option_c',
  D: 'option_d',
}

function App() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [topicFilter, setTopicFilter] = useState('Tous')
  const [difficultyFilter, setDifficultyFilter] = useState('Tous')
  const [questionPoolSize, setQuestionPoolSize] = useState(20)
  const [shuffleQuestions, setShuffleQuestions] = useState(true)
  const [excludeAnswered, setExcludeAnswered] = useState(true)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<OptionKey | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [answered, setAnswered] = useState(0)
  const [score, setScore] = useState(0)
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(new Set())
  const [shuffledOptions, setShuffledOptions] = useState<OptionKey[]>(['A', 'B', 'C', 'D'])

  useEffect(() => {
    let isCancelled = false

    const sanitizeRows = (rows: Question[], sourceLabel: string) =>
      rows
        .filter(
          (row: Question) =>
            row.question?.trim() &&
            row.correct_option?.trim() &&
            row.option_a &&
            row.option_b &&
            row.option_c &&
            row.option_d,
        )
        .map((row: Question, index: number) => {
          const normalizedCorrect =
            row.correct_option?.trim().toUpperCase() || 'A'
          return {
            id: row.id?.trim() || `${sourceLabel}-${index + 1}`,
            question: row.question.trim(),
            option_a: row.option_a.trim(),
            option_b: row.option_b.trim(),
            option_c: row.option_c.trim(),
            option_d: row.option_d.trim(),
            correct_option: normalizedCorrect as OptionKey,
            explanation: row.explanation?.trim() || 'Pas d’explication fournie.',
            topic: row.topic?.trim() || 'Général',
            difficulty: row.difficulty?.trim() || 'Moyen',
          }
        })

    const parseCsv = (source: CsvSource) =>
      new Promise<Question[]>((resolve, reject) => {
        Papa.parse<Question>(source.path, {
          download: true,
          header: true,
          skipEmptyLines: true,
          complete: (results: Papa.ParseResult<Question>) => {
            resolve(sanitizeRows(results.data, source.label))
          },
          error: (err: Error) => {
            reject(
              new Error(
                `${source.path} : ${err.message ?? 'Erreur lors du chargement du CSV'}`,
              ),
            )
          },
        })
      })

    const loadDatasets = async () => {
      setLoading(true)
      setError(null)
      try {
        const datasets = await Promise.all(CSV_SOURCES.map(parseCsv))
        if (!isCancelled) {
          setQuestions(datasets.flat())
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Erreur inconnue')
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    loadDatasets()

    return () => {
      isCancelled = true
    }
  }, [])

  const topics = useMemo(() => {
    return Array.from(new Set(questions.map((q) => q.topic))).sort()
  }, [questions])

  const difficulties = useMemo(() => {
    return Array.from(new Set(questions.map((q) => q.difficulty))).sort()
  }, [questions])

  const difficultyCounts = useMemo(
    () =>
      questions.reduce<Record<string, number>>((acc, q) => {
        acc[q.difficulty] = (acc[q.difficulty] || 0) + 1
        return acc
      }, {}),
    [questions],
  )

  const shuffleOptionsForQuestion = useCallback(() => {
    const options: OptionKey[] = ['A', 'B', 'C', 'D']
    setShuffledOptions([...options].sort(() => Math.random() - 0.5))
  }, [])

  const rebuildSession = useCallback(() => {
    if (!questions.length) {
      setSessionQuestions([])
      return
    }

    const normalizedSearch = searchTerm.trim().toLowerCase()
    let filtered = questions.filter((q) => {
      const matchesTopic = topicFilter === 'Tous' || q.topic === topicFilter
      const matchesDifficulty =
        difficultyFilter === 'Tous' || q.difficulty === difficultyFilter
      const matchesSearch =
        !normalizedSearch ||
        q.question.toLowerCase().includes(normalizedSearch) ||
        q.explanation.toLowerCase().includes(normalizedSearch)
      const notAnswered = !excludeAnswered || !answeredQuestionIds.has(q.id)
      return matchesTopic && matchesDifficulty && matchesSearch && notAnswered
    })

    if (!filtered.length) {
      setSessionQuestions([])
      setCurrentIndex(0)
      setSelectedOption(null)
      setShowAnswer(false)
      setAnswered(0)
      setScore(0)
      return
    }

    const poolSize = Math.min(
      Math.max(1, questionPoolSize),
      filtered.length,
    )
    if (shuffleQuestions) {
      filtered = [...filtered].sort(() => Math.random() - 0.5)
    }
    const limited = filtered.slice(0, poolSize)
    setSessionQuestions(limited)
    setCurrentIndex(0)
    setSelectedOption(null)
    setShowAnswer(false)
    setAnswered(0)
    setScore(0)
  }, [
    questions,
    searchTerm,
    topicFilter,
    difficultyFilter,
    questionPoolSize,
    shuffleQuestions,
    excludeAnswered,
    answeredQuestionIds,
  ])

  useEffect(() => {
    rebuildSession()
    shuffleOptionsForQuestion()
  }, [rebuildSession, shuffleOptionsForQuestion])

  const currentQuestion = sessionQuestions[currentIndex] ?? null
  const accuracy = answered ? Math.round((score / answered) * 100) : 0
  const completion = sessionQuestions.length
    ? Math.round(((currentIndex + (showAnswer ? 1 : 0)) / sessionQuestions.length) * 100)
    : 0

  const handleAnswer = (option: OptionKey) => {
    if (!currentQuestion || showAnswer) return
    setSelectedOption(option)
    setShowAnswer(true)
    const isCorrect = option === currentQuestion.correct_option
    setAnswered((prev) => prev + 1)
    if (isCorrect) {
      setScore((prev) => prev + 1)
    }
    // Marquer la question comme répondue
    setAnsweredQuestionIds((prev) => new Set(prev).add(currentQuestion.id))
  }

  const handleNext = () => {
    if (!sessionQuestions.length) return
    setCurrentIndex((prev) =>
      prev + 1 >= sessionQuestions.length ? 0 : prev + 1,
    )
    setSelectedOption(null)
    setShowAnswer(false)
    shuffleOptionsForQuestion()
  }

  const handlePrevious = () => {
    if (!sessionQuestions.length) return
    setCurrentIndex((prev) =>
      prev - 1 < 0 ? sessionQuestions.length - 1 : prev - 1,
    )
    setSelectedOption(null)
    setShowAnswer(false)
    shuffleOptionsForQuestion()
  }

  const handleRestart = () => {
    rebuildSession()
    shuffleOptionsForQuestion()
  }

  const handleResetProgress = () => {
    setAnsweredQuestionIds(new Set())
    setAnswered(0)
    setScore(0)
    rebuildSession()
    shuffleOptionsForQuestion()
  }

  const unansweredCount = useMemo(() => {
    return questions.filter((q) => !answeredQuestionIds.has(q.id)).length
  }, [questions, answeredQuestionIds])

  const stats = useMemo(
    () => ({
      total: questions.length,
      topics: topics.length,
      lastUpdate: 'Novembre 2025',
    }),
    [questions.length, topics.length],
  )

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Génie logiciel · Base QCM</p>
          <h1>Entraîneur QCM</h1>
          <p>
            Charge automatiquement le dataset CSV et génère des sessions
            d’entraînement personnalisables.
          </p>
        </div>
        <div className="dataset-pill">
          <strong>{stats.total}</strong>
          <span>questions prêtes · {stats.topics} thèmes</span>
          <small>Mise à jour {stats.lastUpdate}</small>
        </div>
      </header>

      <section className="stats-panel">
        <div className="stat-card">
          <span>Total répondus</span>
          <strong>{answered}</strong>
        </div>
        <div className="stat-card">
          <span>Score</span>
          <strong>{score}</strong>
        </div>
        <div className="stat-card">
          <span>Précision</span>
          <strong>{accuracy}%</strong>
        </div>
        <div className="stat-card">
          <span>Avancement</span>
          <strong>{completion}%</strong>
        </div>
        <div className="stat-card">
          <span>Non répondues</span>
          <strong>{unansweredCount}</strong>
        </div>
      </section>

      <section className="controls">
        <div className="control-group">
          <label htmlFor="search">Recherche plein texte</label>
          <input
            id="search"
            type="search"
            placeholder="mot-clé (ex: Merise, SQL...)"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="control-row">
          <div className="control-group">
            <label htmlFor="topic">Filtre thème</label>
            <select
              id="topic"
              value={topicFilter}
              onChange={(event) => setTopicFilter(event.target.value)}
            >
              <option value="Tous">Tous les thèmes</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="difficulty">Difficulté</label>
            <select
              id="difficulty"
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value)}
            >
              <option value="Tous">Toutes</option>
              {difficulties.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
          <div className="control-group number">
            <label htmlFor="pool">Taille de session</label>
            <input
              id="pool"
              type="number"
              min={1}
              max={questions.length || 1}
              value={questionPoolSize}
              onChange={(event) =>
                setQuestionPoolSize(Number(event.target.value) || 1)
              }
            />
            <small>Max {questions.length}</small>
          </div>
        </div>

        <div className="control-row">
          <label className="toggle">
            <input
              type="checkbox"
              checked={shuffleQuestions}
              onChange={(event) => setShuffleQuestions(event.target.checked)}
            />
            <span>Mélanger la session</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={excludeAnswered}
              onChange={(event) => setExcludeAnswered(event.target.checked)}
            />
            <span>Exclure questions répondues</span>
          </label>
        </div>

        <div className="control-row">
          <button className="ghost" onClick={handleRestart}>
            Relancer la session
          </button>
          <button className="ghost" onClick={handleResetProgress}>
            Réinitialiser progression
          </button>
        </div>
      </section>

      <section className="trainer">
        {loading && <p>Chargement des questions…</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && !currentQuestion && (
          <p className="info">
            Aucun résultat pour ces critères. Ajustez vos filtres.
          </p>
        )}

        {currentQuestion && (
          <article className="question-card">
            <div className="question-meta">
              <span>
                Question {currentIndex + 1} / {sessionQuestions.length}
              </span>
              <span>{currentQuestion.topic}</span>
              <span>Difficulté : {currentQuestion.difficulty}</span>
            </div>
            <h2>{currentQuestion.question}</h2>

            <div className="options-list">
              {shuffledOptions.map((option, index) => {
                const optionText = currentQuestion[OPTION_MAP[option]]
                const displayLabel = String.fromCharCode(65 + index) // A, B, C, D
                const isSelected = selectedOption === option
                const isCorrect =
                  showAnswer && option === currentQuestion.correct_option
                const isWrong =
                  showAnswer &&
                  isSelected &&
                  option !== currentQuestion.correct_option

                return (
                  <button
                    key={option}
                    className={[
                      'option-button',
                      isSelected ? 'selected' : '',
                      isCorrect ? 'correct' : '',
                      isWrong ? 'wrong' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleAnswer(option)}
                    disabled={showAnswer}
                  >
                    <span className="option-key">{displayLabel}</span>
                    <span>{optionText}</span>
                  </button>
                )
              })}
            </div>

            {showAnswer && (
              <div className="feedback">
                <p>
                  Correction :{' '}
                  <strong>{currentQuestion.correct_option}</strong>
                </p>
                <p>{currentQuestion.explanation}</p>
              </div>
            )}

            <div className="navigation">
              <button onClick={handlePrevious} disabled={!sessionQuestions.length}>
                ← Précédent
              </button>
              <button
                onClick={handleNext}
                disabled={!sessionQuestions.length}
              >
                Suivant →
              </button>
            </div>
          </article>
        )}
      </section>

      {!!Object.keys(difficultyCounts).length && (
        <section className="difficulty-breakdown">
          <h3>Répartition des difficultés</h3>
          <div className="difficulty-grid">
            {Object.entries(difficultyCounts).map(([level, value]) => (
              <div key={level} className="difficulty-chip">
                <span>{level}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default App
