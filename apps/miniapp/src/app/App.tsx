import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { hadsQuestions, type HadsAnswers, type HadsQuestionId, type HadsScoreResult } from "@mini-hads/domain";
import {
  cancelDoctorSession,
  createDoctorSession,
  getDoctorResults,
  getPatientSession,
  loginDoctor,
  openPatientSession,
  submitPatientAnswers,
  subscribeDoctorEvents,
  type Doctor,
  type SessionRecord,
} from "../shared/api/client";
import { detectPlatform } from "../platform/detectPlatform";
import "../shared/ui/app.css";

type DraftAnswers = Partial<Record<HadsQuestionId, HadsAnswers[HadsQuestionId]>>;

type DoctorResult = HadsScoreResult & {
  sessionId: string;
  submittedAt: string;
  answers: HadsAnswers;
};

type DoctorState = {
  mode: "doctor";
  doctor: Doctor | null;
  sessions: SessionRecord[];
  results: DoctorResult[];
  currentToken: string | null;
  loading: boolean;
  error: string | null;
  showCancelConfirm: boolean;
};

type JoinState = {
  mode: "join";
  token: string;
  doctorName: string;
  loading: boolean;
  error: string | null;
};

type PatientState = {
  mode: "patient";
  token: string;
  doctorName: string;
  result: HadsScoreResult | null;
  loading: boolean;
  error: string | null;
};

type AppState = DoctorState | JoinState | PatientState;

const initialAnswers: DraftAnswers = {};

function getPlatformLabel(platform: string) {
  if (platform === "max") return "MAX";
  if (platform === "telegram") return "Telegram";
  if (platform === "vk") return "VK";
  return "Веб";
}

function getStatusLabel(status: string) {
  if (status === "created") return "Ожидание пациента";
  if (status === "opened") return "Пациент проходит опрос";
  if (status === "submitted") return "Опрос завершён";
  if (status === "cancelled") return "Опрос завершён без сохранения";
  return status;
}

function getPlatformLaunchLink(platform: "max" | "telegram" | "vk" | "web", token: string) {
  const encodedToken = encodeURIComponent(token);
  const maxBotName = import.meta.env.VITE_MAX_BOT_NAME;

  if (platform === "max" && maxBotName) {
    return `https://max.ru/${maxBotName}?startapp=${encodedToken}`;
  }

  const url = new URL(window.location.origin);
  url.searchParams.set("token", token);
  url.searchParams.set("launch", "1");

  if (platform !== "web") {
    url.searchParams.set("platform", platform);
  }

  return url.toString();
}

function shouldConfirmBeforeNewPatient(session?: SessionRecord) {
  if (!session) return false;
  return session.status === "created" || session.status === "opened";
}

export function App() {
  const search = new URLSearchParams(window.location.search);
  const token = search.get("token");
  const launch = search.get("launch") === "1";
  const platform = detectPlatform();
  const [answers, setAnswers] = useState<DraftAnswers>(initialAnswers);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [state, setState] = useState<AppState>(
    token
      ? launch
        ? { mode: "patient", token, doctorName: "", result: null, loading: true, error: null }
        : { mode: "join", token, doctorName: "", loading: true, error: null }
      : {
          mode: "doctor",
          doctor: null,
          sessions: [],
          results: [],
          currentToken: null,
          loading: true,
          error: null,
          showCancelConfirm: false,
        },
  );

  const activeSession = useMemo(() => {
    if (state.mode !== "doctor" || !state.currentToken) return null;
    return state.sessions.find((session) => session.publicToken === state.currentToken) ?? null;
  }, [state]);

  const activeResult = useMemo(() => {
    if (state.mode !== "doctor" || !activeSession) return null;
    return state.results.find((result) => result.sessionId === activeSession.id) ?? null;
  }, [state, activeSession]);

  const patientLink = useMemo(() => {
    if (state.mode !== "doctor" || !state.currentToken) return null;
    return `${window.location.origin}/?token=${state.currentToken}`;
  }, [state]);

  const patientJoinLink = useMemo(() => {
    if (state.mode !== "doctor" || !state.currentToken) return null;
    return `${window.location.origin}/?token=${state.currentToken}`;
  }, [state]);

  const currentQuestion = hadsQuestions[currentQuestionIndex];
  const answeredCount = hadsQuestions.filter((question) => answers[question.id] !== undefined).length;
  const isLastQuestion = currentQuestionIndex === hadsQuestions.length - 1;

  useEffect(() => {
    if (state.mode === "patient") {
      void loadPatient(state.token);
      return;
    }

    if (state.mode === "join") {
      void loadJoin(state.token);
      return;
    }

    void loadDoctor();
  }, []);

  useEffect(() => {
    if (state.mode !== "doctor" || !state.doctor) {
      return;
    }

    const source = subscribeDoctorEvents(state.doctor.id, () => {
      void refreshDoctorDashboard(state.doctor!.id);
    });

    return () => {
      source.close();
    };
  }, [state.mode === "doctor" ? state.doctor?.id : null]);

  async function refreshDoctorDashboard(doctorId: string) {
    const dashboard = await getDoctorResults(doctorId);

    setState((prev) => {
      if (prev.mode !== "doctor") return prev;

      const currentToken =
        prev.currentToken && dashboard.sessions.some((session) => session.publicToken === prev.currentToken)
          ? prev.currentToken
          : dashboard.sessions[0]?.publicToken ?? null;

      return {
        ...prev,
        sessions: dashboard.sessions,
        results: dashboard.results,
        currentToken,
        loading: false,
        error: null,
      };
    });
  }

  async function loadDoctor() {
    setState((prev) => ({ ...prev, loading: true, error: null }) as AppState);

    try {
      const auth = await loginDoctor(platform);
      const dashboard = await getDoctorResults(auth.doctor.id);

      setState({
        mode: "doctor",
        doctor: auth.doctor,
        sessions: dashboard.sessions,
        results: dashboard.results,
        currentToken: dashboard.sessions[0]?.publicToken ?? null,
        loading: false,
        error: null,
        showCancelConfirm: false,
      });
    } catch (error) {
      setState({
        mode: "doctor",
        doctor: null,
        sessions: [],
        results: [],
        currentToken: null,
        loading: false,
        error: error instanceof Error ? error.message : "Не удалось загрузить кабинет врача",
        showCancelConfirm: false,
      });
    }
  }

  async function loadJoin(sessionToken: string) {
    try {
      const response = await getPatientSession(sessionToken);
      setState({
        mode: "join",
        token: sessionToken,
        doctorName: response.session.doctorName,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState({
        mode: "join",
        token: sessionToken,
        doctorName: "",
        loading: false,
        error: error instanceof Error ? error.message : "Не удалось открыть приглашение",
      });
    }
  }

  async function loadPatient(sessionToken: string) {
    try {
      const response = await getPatientSession(sessionToken);
      await openPatientSession(sessionToken);
      setCurrentQuestionIndex(0);

      setState({
        mode: "patient",
        token: sessionToken,
        doctorName: response.session.doctorName,
        result: null,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState({
        mode: "patient",
        token: sessionToken,
        doctorName: "",
        result: null,
        loading: false,
        error: error instanceof Error ? error.message : "Не удалось открыть опрос",
      });
    }
  }

  async function createNextPatientSession() {
    if (state.mode !== "doctor" || !state.doctor) return;

    setState({ ...state, loading: true, error: null, showCancelConfirm: false });

    try {
      const response = await createDoctorSession(state.doctor.id);
      const dashboard = await getDoctorResults(state.doctor.id);

      setState({
        ...state,
        sessions: dashboard.sessions,
        results: dashboard.results,
        currentToken: response.session.publicToken,
        loading: false,
        error: null,
        showCancelConfirm: false,
      });
    } catch (error) {
      setState({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : "Не удалось создать сессию",
        showCancelConfirm: false,
      });
    }
  }

  async function handleNewPatient() {
    if (state.mode !== "doctor") return;

    if (shouldConfirmBeforeNewPatient(activeSession ?? undefined)) {
      setState({ ...state, showCancelConfirm: true });
      return;
    }

    await createNextPatientSession();
  }

  async function handleCancelCurrentWithoutSaving() {
    if (state.mode !== "doctor" || !state.currentToken) return;

    setState({ ...state, loading: true, error: null, showCancelConfirm: false });

    try {
      await cancelDoctorSession(state.currentToken);
      await createNextPatientSession();
    } catch (error) {
      setState({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : "Не удалось завершить текущий опрос",
        showCancelConfirm: false,
      });
    }
  }

  async function handleSubmitPatient() {
    if (state.mode !== "patient") return;

    const hasMissingAnswers = hadsQuestions.some((question) => answers[question.id] === undefined);

    if (hasMissingAnswers) {
      setState({
        ...state,
        error: "Пожалуйста, ответьте на все вопросы перед отправкой.",
      });
      return;
    }

    setState({ ...state, loading: true, error: null });

    try {
      const response = await submitPatientAnswers(state.token, answers as HadsAnswers);
      setState({
        ...state,
        loading: false,
        result: response.result,
      });
    } catch (error) {
      setState({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : "Не удалось отправить ответы",
      });
    }
  }

  function handleSelectAnswer(questionId: HadsQuestionId, value: HadsAnswers[HadsQuestionId]) {
    if (isAdvancing) {
      return;
    }

    setAnswers((prev) => ({ ...prev, [questionId]: value }));

    if (!isLastQuestion) {
      setIsAdvancing(true);
      window.setTimeout(() => {
        setCurrentQuestionIndex((prev) => Math.min(prev + 1, hadsQuestions.length - 1));
        setIsAdvancing(false);
      }, 260);
    }
  }

  async function copyPatientLink() {
    if (!patientJoinLink) return;
    await navigator.clipboard.writeText(patientJoinLink);
  }

  function launchPatientFlow(nextPlatform: "max" | "telegram" | "vk" | "web") {
    if (state.mode !== "join") return;
    window.location.href = getPlatformLaunchLink(nextPlatform, state.token);
  }

  if (state.mode === "join") {
    return (
      <main className="shell shell-patient">
        <section className="hero patient-hero stack">
          <div className="topline">
            <span className="pill">Переход к опросу</span>
            <span className="inline-note">Praxium</span>
          </div>
          <h1 className="hero-title">Выберите, как открыть опрос</h1>
          <p className="hero-copy muted">
            Ссылка получена от врача {state.doctorName || "Praxium"}. Вы можете открыть опрос в Mini App нужной платформы или продолжить в браузере для локального теста.
          </p>
          {state.error ? <p>{state.error}</p> : null}
          <div className="join-grid">
            <button className="card join-card" onClick={() => launchPatientFlow("max")}>
              <span className="pill">MAX</span>
              <strong>Открыть в MAX</strong>
              <span className="muted">Основной сценарий для Mini App.</span>
            </button>
            <button className="card join-card" onClick={() => launchPatientFlow("telegram")}>
              <span className="pill">Telegram</span>
              <strong>Открыть в Telegram</strong>
              <span className="muted">Используйте для теста контейнера Telegram Mini Apps.</span>
            </button>
            <button className="card join-card" onClick={() => launchPatientFlow("vk")}>
              <span className="pill">VK</span>
              <strong>Открыть в VK</strong>
              <span className="muted">Подходит для сценария VK Mini Apps.</span>
            </button>
            <button className="card join-card accent-panel" onClick={() => launchPatientFlow("web")}>
              <span className="pill">Веб</span>
              <strong>Продолжить в браузере</strong>
              <span className="muted">Удобно для локальной разработки и проверки flow.</span>
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (state.mode === "patient") {
    return (
      <main className="shell shell-patient">
        <section className="hero patient-hero stack">
          <div className="topline">
            <span className="pill">Опрос пациента</span>
            <span className="inline-note">{getPlatformLabel(platform)}</span>
          </div>
          <h1 className="hero-title">Госпитальная шкала тревоги и депрессии</h1>
          <div className="hero-copy muted stack intro-copy">
            <p>
              Врачам известно, что эмоции играют важную роль при большинстве заболеваний. Если ваш врач узнает об этих
              чувствах, он сможет лучше вам помочь. Эта анкета предназначена для того, чтобы ваш врач был более подробно
              осведомлен о вашем самочувствии.
            </p>
            <p>
              Прочитайте каждый пункт и поставьте отметку напротив ответа, наиболее соответствующего тому, как вы себя
              чувствовали на прошлой неделе.
            </p>
            <p>
              Не задумывайтесь слишком долго над своими ответами: ваша первая реакция на каждый пункт, вероятно, будет
              более точной, чем тщательно продуманный ответ.
            </p>
          </div>
          <div className="patient-progress card accent-panel">
            <div>
              <strong>Вопрос {currentQuestionIndex + 1} из 14</strong>
              <div className="muted">Среднее время прохождения: 3-5 минут</div>
            </div>
            <div className="patient-progress__meta">
              <div className="muted">Отвечено</div>
              <div className="score-small">{answeredCount}/14</div>
            </div>
          </div>
          {state.error ? <p>{state.error}</p> : null}
          {state.result ? (
            <div className="grid">
              <article className="card stack metric-card">
                <div className="muted">Тревога</div>
                <div className="score">{state.result.anxietyScore}</div>
                <strong>{state.result.anxietyInterpretation}</strong>
              </article>
              <article className="card stack metric-card accent-panel">
                <div className="muted">Депрессия</div>
                <div className="score">{state.result.depressionScore}</div>
                <strong>{state.result.depressionInterpretation}</strong>
              </article>
              <article className="card stack patient-finish">
                <div className="section-title">Опрос завершён</div>
                <p className="muted">Спасибо. Результаты уже доступны врачу. Вы можете закрыть окно или вернуться в мессенджер.</p>
              </article>
            </div>
          ) : (
            <>
              <div className="question-shell stack">
                <div className="question-toolbar">
                  <button
                    className="icon-back"
                    type="button"
                    disabled={currentQuestionIndex === 0}
                    onClick={() => setCurrentQuestionIndex((prev) => Math.max(prev - 1, 0))}
                    aria-label="Назад"
                  >
                    ←
                  </button>
                  <span className="muted">Шаг {currentQuestionIndex + 1}</span>
                </div>
                <fieldset key={currentQuestion.id} className="question stack question-single">
                  <legend>
                    <strong>{currentQuestion.number}. {currentQuestion.text}</strong>
                  </legend>
                  <div className="options">
                    {currentQuestion.options.map((option) => (
                      <label
                        key={`${currentQuestion.id}-${option.value}`}
                        className={`option ${answers[currentQuestion.id] === option.value ? "option-selected" : ""}`}
                      >
                          <input
                            type="radio"
                            name={currentQuestion.id}
                            checked={answers[currentQuestion.id] === option.value}
                            disabled={isAdvancing}
                            onChange={() => handleSelectAnswer(currentQuestion.id, option.value)}
                          />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="patient-actions">
                {isLastQuestion && answers[currentQuestion.id] !== undefined ? (
                  <button className="button button-large" disabled={state.loading} onClick={handleSubmitPatient}>
                    {state.loading ? "Отправляем..." : "Завершить опрос и отправить врачу"}
                  </button>
                ) : (
                  <p className="muted">Выберите вариант ответа, чтобы перейти к следующему вопросу.</p>
                )}
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <button className="button floating-action" disabled={state.loading} onClick={handleNewPatient}>
        Новый пациент
      </button>

      <section className="hero stack">
        <div className="topline">
          <span className="pill">Кабинет врача</span>
          <span className="inline-note">Realtime</span>
        </div>
        <h1 className="hero-title">Мини-приложение HADS</h1>
        <p className="hero-copy muted">
          Врач создаёт QR-код для нового пациента, а статус и результаты обновляются автоматически без перезагрузки экрана.
        </p>
        {state.error ? <p>{state.error}</p> : null}

        {state.showCancelConfirm ? (
          <div className="card confirm-card stack">
            <h2 className="section-title">Текущий опрос ещё не завершён</h2>
            <p className="muted">Данные текущего опроса не будут сохранены. Что сделать дальше?</p>
            <div className="doctor-actions">
              <button className="button secondary" onClick={() => setState({ ...state, showCancelConfirm: false })}>
                Подождать
              </button>
              <button className="button" onClick={handleCancelCurrentWithoutSaving}>
                Завершить текущий опрос без сохранения результатов
              </button>
            </div>
          </div>
        ) : null}

        {!activeSession ? (
          <article className="card doctor-empty stack">
            <h2 className="section-title">Новый пациент</h2>
            <p className="muted">Нажмите кнопку `Новый пациент`, чтобы сгенерировать экран с QR-кодом и начать новый опрос.</p>
          </article>
        ) : (
          <div className="doctor-showcase">
            <article className="card doctor-lead stack metric-card">
              <div className="doctor-lead__head">
                <div>
                  <div className="muted">Платформа</div>
                  <strong>{getPlatformLabel(platform)}</strong>
                </div>
                <div>
                  <div className="muted">Врач</div>
                  <strong>{state.doctor?.displayName ?? "Загрузка..."}</strong>
                </div>
              </div>
              <h2 className="section-title">{getStatusLabel(activeSession.status)}</h2>
              <p className="muted">
                {activeSession.status === "created" && "Покажите пациенту QR-код или отправьте ссылку для перехода к опросу."}
                {activeSession.status === "opened" && "Пациент открыл опрос. Дождитесь завершения, результаты появятся автоматически."}
                {activeSession.status === "submitted" && "Опрос завершён. Результаты текущего пациента отображаются на этом экране."}
                {activeSession.status === "cancelled" && "Текущая сессия завершена без сохранения результатов."}
              </p>
              {patientJoinLink ? (
                <div className="doctor-actions">
                  <button className="button secondary" onClick={copyPatientLink}>
                    Скопировать ссылку
                  </button>
                </div>
              ) : null}

              {activeResult ? (
                <div className="grid">
                  <div className="card stack metric-card">
                    <span className="muted">Тревога</span>
                    <div className="score">{activeResult.anxietyScore}</div>
                    <strong>{activeResult.anxietyInterpretation}</strong>
                  </div>
                  <div className="card stack metric-card accent-panel">
                    <span className="muted">Депрессия</span>
                    <div className="score">{activeResult.depressionScore}</div>
                    <strong>{activeResult.depressionInterpretation}</strong>
                  </div>
                </div>
              ) : null}
            </article>

            <article className="card qr-card accent-panel stack">
              {activeSession.status === "submitted" && activeResult ? (
                <>
                  <div className="qr-card__top">
                    <div>
                      <div className="muted">Результаты текущего пациента</div>
                      <strong>Ответы и трактовка</strong>
                    </div>
                    <span className="pill">Готово</span>
                  </div>
                  <div className="answers-list">
                    {hadsQuestions.map((question) => {
                      const answerValue = activeResult.answers[question.id];
                      const answerLabel = question.options.find((option) => option.value === answerValue)?.label ?? "Нет ответа";

                      return (
                        <div key={`active-${question.id}`} className="answer-row">
                          <strong>{question.number}. {question.text}</strong>
                          <div className="muted">Ответ: {answerLabel}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="qr-card__top">
                    <div>
                      <div className="muted">QR для пациента</div>
                      <strong>{activeSession.status === "opened" ? "Пациент проходит опрос" : "Сканируйте камерой телефона"}</strong>
                    </div>
                    <span className="pill">{getStatusLabel(activeSession.status)}</span>
                  </div>
                  <div className="qr-frame">
                    {patientJoinLink ? <QRCodeSVG value={patientJoinLink} size={212} bgColor="#ffffff" fgColor="#15654a" includeMargin /> : <div className="qr-placeholder">QR появится после создания сессии</div>}
                  </div>
                  {patientJoinLink ? <code className="code">{patientJoinLink}</code> : <p className="muted">Сначала создайте сессию опроса.</p>}
                </>
              )}
            </article>
          </div>
        )}
      </section>
    </main>
  );
}
