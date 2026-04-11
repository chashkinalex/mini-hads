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
import type { SupportedPlatform } from "../platform/types";
import { bindMaxBackButton, getMaxStartParam, openExternalUrl, openMaxUrl, prepareMaxWebApp } from "../platform/max";
import { getTelegramStartParam, prepareTelegramWebApp } from "../platform/telegram";
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

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
  const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
  const telegramAppName = import.meta.env.VITE_TELEGRAM_APP_NAME;

  if (platform === "max" && maxBotName) {
    return `https://max.ru/${maxBotName}?startapp=${encodedToken}`;
  }

  if (platform === "telegram" && telegramBotUsername) {
    if (telegramAppName) {
      return `https://t.me/${telegramBotUsername}/${telegramAppName}?startapp=${encodedToken}`;
    }

    return `https://t.me/${telegramBotUsername}?startattach=${encodedToken}`;
  }

  const url = new URL("/survey", window.location.origin);
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

function getLaunchContext(): { token: string | null; launch: boolean; platform: SupportedPlatform } {
  const search = new URLSearchParams(window.location.search);
  const maxToken = getMaxStartParam();
  const telegramToken = getTelegramStartParam();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const explicitLaunchPath = pathname === "/survey";

  return {
    token: search.get("token") ?? maxToken ?? telegramToken,
    launch: explicitLaunchPath || search.get("launch") === "1" || Boolean(maxToken) || Boolean(telegramToken),
    platform: detectPlatform(),
  };
}

export function App() {
  const initialContext = getLaunchContext();
  const platform = initialContext.platform;
  const [answers, setAnswers] = useState<DraftAnswers>(initialAnswers);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [showDoctorAnswers, setShowDoctorAnswers] = useState(false);
  const [showPatientAnswers, setShowPatientAnswers] = useState(false);
  const [doctorView, setDoctorView] = useState<"current" | "results">("current");
  const [selectedDoctorResultId, setSelectedDoctorResultId] = useState<string | null>(null);
  const [state, setState] = useState<AppState>(
    initialContext.token
      ? initialContext.launch
        ? { mode: "patient", token: initialContext.token, doctorName: "", result: null, loading: true, error: null }
        : { mode: "join", token: initialContext.token, doctorName: "", loading: true, error: null }
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

  useEffect(() => {
    if (platform !== "max") {
      if (platform === "telegram") {
        prepareTelegramWebApp();
      }

      return;
    }

    prepareMaxWebApp();
  }, [platform]);

  useEffect(() => {
    let cancelled = false;

    function syncLaunchContext() {
      if (cancelled) {
        return true;
      }

      const context = getLaunchContext();

      if (!context.token) {
        return false;
      }

      const launchedToken = context.token;

      setState((prev) => {
        if ((prev.mode === "patient" || prev.mode === "join") && prev.token === launchedToken) {
          return prev;
        }

        if (context.launch) {
          return {
            mode: "patient",
            token: launchedToken,
            doctorName: "",
            result: null,
            loading: true,
            error: null,
          };
        }

        return {
          mode: "join",
          token: launchedToken,
          doctorName: "",
          loading: true,
          error: null,
        };
      });

      return true;
    }

    if (syncLaunchContext()) {
      return () => {
        cancelled = true;
      };
    }

    let attempts = 0;
    const intervalId = window.setInterval(() => {
      attempts += 1;

      if (syncLaunchContext() || attempts >= 20) {
        window.clearInterval(intervalId);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const activeSession = useMemo(() => {
    if (state.mode !== "doctor" || !state.currentToken) return null;
    return state.sessions.find((session) => session.publicToken === state.currentToken) ?? null;
  }, [state]);

  const activeResult = useMemo(() => {
    if (state.mode !== "doctor" || !activeSession) return null;
    return state.results.find((result) => result.sessionId === activeSession.id) ?? null;
  }, [state, activeSession]);

  const patientJoinLink = useMemo(() => {
    if (state.mode !== "doctor" || !state.currentToken) return null;
    return new URL(`/join?token=${state.currentToken}`, window.location.origin).toString();
  }, [state]);

  const currentQuestion = hadsQuestions[currentQuestionIndex];
  const answeredCount = hadsQuestions.filter((question) => answers[question.id] !== undefined).length;
  const isLastQuestion = currentQuestionIndex === hadsQuestions.length - 1;

  useEffect(() => {
    setShowDoctorAnswers(false);
  }, [state.mode === "doctor" ? state.currentToken : null]);

  useEffect(() => {
    if (state.mode === "doctor" && doctorView === "results" && !selectedDoctorResultId && state.results[0]) {
      setSelectedDoctorResultId(state.results[0].sessionId);
    }
  }, [state.mode === "doctor" ? state.results : null, doctorView, selectedDoctorResultId]);

  useEffect(() => {
    if (platform !== "max") {
      return;
    }

    if (state.mode !== "patient" || state.result) {
      return bindMaxBackButton(false, () => {});
    }

    const canGoBack = currentQuestionIndex > 0;

    return bindMaxBackButton(canGoBack, () => {
      setCurrentQuestionIndex((prev) => Math.max(prev - 1, 0));
    });
  }, [platform, state.mode, state.mode === "patient" ? state.result : null, currentQuestionIndex]);

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

    const source = subscribeDoctorEvents(() => {
      void refreshDoctorDashboard();
    });

    return () => {
      source.close();
    };
  }, [state.mode === "doctor" ? state.doctor?.id : null]);

  useEffect(() => {
    if (state.mode !== "doctor" || !state.doctor) {
      return;
    }

    const refreshSafely = () => {
      void refreshDoctorDashboard().catch(() => {
        // MAX webviews can be flaky with long-lived connections; polling is best-effort.
      });
    };

    const intervalId = window.setInterval(refreshSafely, 4000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSafely();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [state.mode === "doctor" ? state.doctor?.id : null]);

  async function refreshDoctorDashboard() {
    const dashboard = await getDoctorResults();

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
      const dashboard = await getDoctorResults();

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

    setDoctorView("current");
    setSelectedDoctorResultId(null);
    setState({ ...state, loading: true, error: null, showCancelConfirm: false });

    try {
      const response = await createDoctorSession();
      const dashboard = await getDoctorResults();

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
    setDoctorView("current");

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
      const message = error instanceof Error ? error.message : "Не удалось завершить текущий опрос";

      if (message === "Cannot cancel a completed session") {
        await refreshDoctorDashboard();
        await createNextPatientSession();
        return;
      }

      setState({
        ...state,
        loading: false,
        error: message,
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

  function getJoinNavigationProps(nextPlatform: "max" | "telegram" | "vk" | "web") {
    if (state.mode !== "join") return;
    const targetUrl = getPlatformLaunchLink(nextPlatform, state.token);

    const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (nextPlatform === "max" && platform === "max") {
        event.preventDefault();
        openMaxUrl(targetUrl);
        return;
      }

      if (platform === "max") {
        event.preventDefault();
        openExternalUrl(targetUrl);
      }
    };

    return {
      href: targetUrl,
      onClick,
    };
  }

  if (state.mode === "join") {
    const maxLinkProps = getJoinNavigationProps("max");
    const webLinkProps = getJoinNavigationProps("web");

    return (
      <main className="shell shell-patient">
        <section className="hero patient-hero join-hero stack">
          <div className="topline">
            <span className="pill">Переход к опросу</span>
            <span className="inline-note">Praxium</span>
          </div>
          <h1 className="hero-title">Где пройти HADS?</h1>
          <p className="hero-copy muted">
            Ссылка получена от врача {state.doctorName || "Praxium"}. Выберите удобное приложение, чтобы открыть
            короткий опрос. Данные будут переданы только врачу, который выдал QR-код.
          </p>
          {state.error ? <p>{state.error}</p> : null}
          <div className="join-note">
            <span>14 вопросов</span>
            <span>3-5 минут</span>
            <span>Без регистрации пациента</span>
          </div>
          <div className="join-grid join-grid-compact">
            <a className="card join-card join-card-primary" href={maxLinkProps?.href} onClick={maxLinkProps?.onClick}>
              <span className="join-card__mark">M</span>
              <span className="pill">Рекомендуется</span>
              <strong>Открыть в MAX</strong>
              <span className="muted">Основной сценарий Praxium Mini App.</span>
            </a>
            <a className="card join-card join-card-web" href={webLinkProps?.href} onClick={webLinkProps?.onClick}>
              <span className="join-card__mark">Web</span>
              <span className="pill">Веб</span>
              <strong>Продолжить в браузере</strong>
              <span className="muted">Если не хотите открывать мессенджер.</span>
            </a>
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
            <span className="pill">{state.result ? "Результаты пациента" : "Опрос пациента"}</span>
            <span className="inline-note">{getPlatformLabel(platform)}</span>
          </div>
          <h1 className="hero-title">{state.result ? "Результаты HADS" : "Госпитальная шкала тревоги и депрессии"}</h1>
          {!state.result ? (
            <>
              <div className="hero-copy muted stack intro-copy">
                <p>
                  Врачам известно, что эмоции играют важную роль при большинстве заболеваний. Если ваш врач узнает об
                  этих чувствах, он сможет лучше вам помочь. Эта анкета предназначена для того, чтобы ваш врач был более
                  подробно осведомлен о вашем самочувствии.
                </p>
                <p>
                  Прочитайте каждый пункт и поставьте отметку напротив ответа, наиболее соответствующего тому, как вы
                  себя чувствовали на прошлой неделе.
                </p>
                <p>
                  Не задумывайтесь слишком долго над своими ответами: ваша первая реакция на каждый пункт, вероятно,
                  будет более точной, чем тщательно продуманный ответ.
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
            </>
          ) : (
            <p className="hero-copy muted">Результаты переданы врачу. Вы можете раскрыть ответы и проверить выбранные варианты.</p>
          )}
          {state.error ? <p>{state.error}</p> : null}
          {state.result ? (
            <div className="patient-result stack">
              <article className="card stack patient-finish">
                <div className="section-title">Опрос завершён</div>
                <p className="muted">Спасибо. Результаты уже доступны врачу.</p>
              </article>
              <button className="doctor-result-summary patient-result-summary" type="button" onClick={() => setShowPatientAnswers((value) => !value)}>
                <span className="pill">Ваш результат</span>
                <span className="doctor-result-grid">
                  <span>
                    <span className="muted">Тревога</span>
                    <strong>{state.result.anxietyScore}</strong>
                    <small>{state.result.anxietyInterpretation}</small>
                  </span>
                  <span>
                    <span className="muted">Депрессия</span>
                    <strong>{state.result.depressionScore}</strong>
                    <small>{state.result.depressionInterpretation}</small>
                  </span>
                </span>
                <span className="muted">{showPatientAnswers ? "Скрыть ответы" : "Тапните, чтобы посмотреть ваши ответы"}</span>
              </button>
              {showPatientAnswers ? (
                <div className="answers-list doctor-answers-list">
                  {hadsQuestions.map((question) => {
                    const answerValue = answers[question.id];
                    const answerLabel = answerValue === undefined ? "Нет ответа" : question.options.find((option) => option.value === answerValue)?.label ?? "Нет ответа";

                    return (
                      <div key={`patient-${question.id}`} className="answer-row">
                        <strong>{question.number}. {question.text}</strong>
                        <div className="muted">Ответ: {answerLabel}</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
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
    <main className="shell doctor-shell">
      <section className="hero doctor-hero stack">
        <div className="doctor-header">
          <h1 className="doctor-title">HADS</h1>
          <span className="pill">{getPlatformLabel(platform)}</span>
        </div>
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

        {doctorView === "results" ? (
          <article className="card doctor-main-card doctor-results-screen stack">
            <div className="doctor-results-head">
              <div>
                <span className="pill">История</span>
                <h2 className="section-title">Результаты</h2>
              </div>
              <button className="button secondary" type="button" onClick={() => setDoctorView("current")}>
                К текущему
              </button>
            </div>
            {state.results.length === 0 ? (
              <p className="muted">Завершённых опросов пока нет.</p>
            ) : (
              <div className="doctor-results-layout">
                <div className="doctor-results-list">
                  {state.results.map((result) => (
                    <button
                      key={result.sessionId}
                      className={`doctor-result-row ${selectedDoctorResultId === result.sessionId ? "doctor-result-row-active" : ""}`}
                      type="button"
                      onClick={() => setSelectedDoctorResultId(result.sessionId)}
                    >
                      <span>{formatDateTime(result.submittedAt)}</span>
                      <strong>Т {result.anxietyScore} / Д {result.depressionScore}</strong>
                    </button>
                  ))}
                </div>
                {state.results.find((result) => result.sessionId === selectedDoctorResultId) ? (
                  <div className="answers-list doctor-answers-list">
                    {(() => {
                      const selectedResult = state.results.find((result) => result.sessionId === selectedDoctorResultId)!;

                      return (
                        <>
                          <div className="doctor-result-grid doctor-result-grid-compact">
                            <span>
                              <span className="muted">Тревога</span>
                              <strong>{selectedResult.anxietyScore}</strong>
                              <small>{selectedResult.anxietyInterpretation}</small>
                            </span>
                            <span>
                              <span className="muted">Депрессия</span>
                              <strong>{selectedResult.depressionScore}</strong>
                              <small>{selectedResult.depressionInterpretation}</small>
                            </span>
                          </div>
                          {hadsQuestions.map((question) => {
                            const answerValue = selectedResult.answers[question.id];
                            const answerLabel = question.options.find((option) => option.value === answerValue)?.label ?? "Нет ответа";

                            return (
                              <div key={`history-${selectedResult.sessionId}-${question.id}`} className="answer-row">
                                <strong>{question.number}. {question.text}</strong>
                                <div className="muted">Ответ: {answerLabel}</div>
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
            )}
          </article>
        ) : !activeSession ? (
          <article className="card doctor-empty doctor-main-card stack">
            <h2 className="section-title">Новый пациент</h2>
            <p className="muted">Создайте QR-код для прохождения HADS.</p>
          </article>
        ) : (
          <article className="card doctor-main-card stack">
            {activeSession.status === "submitted" && activeResult ? (
              <>
                <button
                  className="doctor-result-summary"
                  type="button"
                  onClick={() => setShowDoctorAnswers((value) => !value)}
                  aria-expanded={showDoctorAnswers}
                >
                  <span className="pill">Результаты</span>
                  <span className="doctor-result-grid">
                    <span>
                      <span className="muted">Тревога</span>
                      <strong>{activeResult.anxietyScore}</strong>
                      <small>{activeResult.anxietyInterpretation}</small>
                    </span>
                    <span>
                      <span className="muted">Депрессия</span>
                      <strong>{activeResult.depressionScore}</strong>
                      <small>{activeResult.depressionInterpretation}</small>
                    </span>
                  </span>
                  <span className="muted">{showDoctorAnswers ? "Скрыть ответы" : "Тапните, чтобы посмотреть ответы"}</span>
                </button>

                {showDoctorAnswers ? (
                  <div className="answers-list doctor-answers-list">
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
                ) : null}
              </>
            ) : activeSession.status === "opened" ? (
              <div className="doctor-status-card">
                <span className="pill">Статус</span>
                <h2>Пациент проходит опрос</h2>
                <p className="muted">Результаты появятся здесь автоматически после отправки.</p>
              </div>
            ) : (
              <>
                <div className="qr-card__top">
                  <div>
                    <div className="muted">QR для пациента</div>
                    <strong>Сканируйте камерой телефона</strong>
                  </div>
                  <span className="pill">{getStatusLabel(activeSession.status)}</span>
                </div>
                <div className="qr-frame doctor-qr-frame">
                  {patientJoinLink ? <QRCodeSVG value={patientJoinLink} size={238} bgColor="#ffffff" fgColor="#15654a" includeMargin /> : <div className="qr-placeholder">QR появится после создания сессии</div>}
                </div>
                {patientJoinLink ? (
                  <button className="button secondary button-large" onClick={copyPatientLink}>
                    Скопировать ссылку
                  </button>
                ) : null}
              </>
            )}
          </article>
        )}

        <div className="doctor-bottom-actions">
          <button
            className={`button ${doctorView === "results" ? "" : "secondary"}`}
            type="button"
            onClick={() => setDoctorView((view) => (view === "results" ? "current" : "results"))}
          >
            {doctorView === "results" ? "Текущий" : "Результаты"}
          </button>
          <button className="button" disabled={state.loading} onClick={handleNewPatient}>
            Новый пациент
          </button>
        </div>
      </section>
    </main>
  );
}
