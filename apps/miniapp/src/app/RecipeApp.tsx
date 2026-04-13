import { useEffect, useMemo, useState } from "react";
import { trackGoal } from "../shared/analytics/metrika";
import "./recipe.css";

type Patient = {
  name: string;
  birthDate: string;
  diagnosis: string;
};

type PrescriptionItem = {
  id: string;
  name: string;
  form: string;
  dosage: string;
  quantity: string;
  months: string;
  instructions: string;
};

type RecipeDraft = {
  patient: Patient;
  doctorName: string;
  clinicName: string;
  items: PrescriptionItem[];
};

type HistoryItem = RecipeDraft & {
  id: string;
  savedAt: string;
};

const RECIPE_HISTORY_KEY = "praxium_recipe_history";

const emptyPatient: Patient = {
  name: "",
  birthDate: "",
  diagnosis: "",
};

const initialDraft: RecipeDraft = {
  patient: emptyPatient,
  doctorName: "",
  clinicName: "Praxium",
  items: [],
};

const medicationTemplates: Array<Omit<PrescriptionItem, "id" | "quantity" | "months">> = [
  {
    name: "Сертралин",
    form: "таб.",
    dosage: "50 мг",
    instructions: "по 1 таблетке утром",
  },
  {
    name: "Эсциталопрам",
    form: "таб.",
    dosage: "10 мг",
    instructions: "по 1 таблетке утром",
  },
  {
    name: "Венлафаксин",
    form: "капс.",
    dosage: "75 мг",
    instructions: "по 1 капсуле утром",
  },
  {
    name: "Агомелатин",
    form: "таб.",
    dosage: "25 мг",
    instructions: "по 1 таблетке на ночь",
  },
  {
    name: "Кветиапин",
    form: "таб.",
    dosage: "25 мг",
    instructions: "по 1 таблетке на ночь",
  },
];

function createItem(): PrescriptionItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    form: "таб.",
    dosage: "",
    quantity: "30",
    months: "1",
    instructions: "",
  };
}

function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(RECIPE_HISTORY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECIPE_HISTORY_KEY, JSON.stringify(items));
}

function encodeDraft(draft: RecipeDraft) {
  const json = JSON.stringify(draft);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeDraft(value: string): RecipeDraft | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(value))));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) return null;

    return {
      patient: { ...emptyPatient, ...(parsed.patient ?? {}) },
      doctorName: String(parsed.doctorName ?? ""),
      clinicName: String(parsed.clinicName ?? "Praxium"),
      items: parsed.items.map((item: Partial<PrescriptionItem>) => ({
        ...createItem(),
        ...item,
        id: item.id ?? crypto.randomUUID(),
      })),
    };
  } catch {
    return null;
  }
}

function getImportedDraft() {
  if (typeof window === "undefined") return null;

  const search = new URLSearchParams(window.location.search);
  const recipeParam = search.get("recipe");
  if (recipeParam) return decodeDraft(recipeParam);

  const importMatch = window.location.pathname.match(/\/import\/([^/]+)/);
  if (importMatch?.[1]) return decodeDraft(importMatch[1]);

  return null;
}

function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU").format(new Date(value));
}

function renderLine(item: PrescriptionItem) {
  const parts = [item.form, item.name, item.dosage].filter(Boolean).join(" ");
  const quantity = item.quantity ? `N ${item.quantity}` : "";
  const months = item.months ? `на ${item.months} мес.` : "";
  return [parts, quantity, months].filter(Boolean).join(", ");
}

export function RecipeApp() {
  const [draft, setDraft] = useState<RecipeDraft>(() => getImportedDraft() ?? initialDraft);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [showHistory, setShowHistory] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const isReadyToPrint = draft.patient.name.trim() && draft.patient.birthDate.trim() && draft.doctorName.trim() && draft.items.length > 0;

  const selectedSummary = useMemo(() => draft.items.filter((item) => item.name.trim()), [draft.items]);

  useEffect(() => {
    document.title = "Рецепты";
    trackGoal("recipe_app_opened", { items: draft.items.length });
  }, []);

  function updatePatient(patch: Partial<Patient>) {
    setDraft((prev) => ({ ...prev, patient: { ...prev.patient, ...patch } }));
  }

  function updateItem(id: string, patch: Partial<PrescriptionItem>) {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function addItem(template?: Omit<PrescriptionItem, "id" | "quantity" | "months">) {
    const item = {
      ...createItem(),
      ...(template ?? {}),
    };

    setDraft((prev) => ({ ...prev, items: [...prev.items, item] }));
    trackGoal("recipe_medication_added", { fromTemplate: Boolean(template) });
  }

  function removeItem(id: string) {
    setDraft((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }));
  }

  function clearDraft() {
    setDraft(initialDraft);
    setShareCopied(false);
    trackGoal("recipe_draft_cleared");
  }

  function saveCurrentToHistory() {
    const item: HistoryItem = {
      ...draft,
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
    };
    const nextHistory = [item, ...history].slice(0, 30);
    saveHistory(nextHistory);
    setHistory(nextHistory);
    trackGoal("recipe_saved_to_history", { items: draft.items.length });
  }

  async function copyShareLink() {
    const url = new URL(window.location.href);
    url.pathname = "/recipe/import/" + encodeDraft(draft);
    url.search = "";
    await navigator.clipboard.writeText(url.toString());
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2500);
    trackGoal("recipe_share_link_copied", { items: draft.items.length });
  }

  function printRecipe() {
    saveCurrentToHistory();
    trackGoal("recipe_print_opened", { items: draft.items.length });
    window.print();
  }

  return (
    <main className="recipe-shell">
      <section className="recipe-workspace">
        <header className="recipe-header">
          <div>
            <span className="recipe-pill">Praxium Scales</span>
            <h1>Рецепты</h1>
            <p>Быстро соберите рецепт, сохраните в историю, отправьте ссылкой или распечатайте.</p>
          </div>
          <div className="recipe-header-actions">
            <button className="recipe-button recipe-button-secondary" type="button" onClick={() => setShowHistory((value) => !value)}>
              {showHistory ? "Скрыть историю" : `История (${history.length})`}
            </button>
            <button className="recipe-button recipe-button-secondary" type="button" onClick={clearDraft}>
              Очистить
            </button>
          </div>
        </header>

        {showHistory ? (
          <article className="recipe-card recipe-history">
            <h2>История</h2>
            {history.length === 0 ? (
              <p className="recipe-muted">Сохранённых рецептов пока нет.</p>
            ) : (
              <div className="recipe-history-list">
                {history.map((item) => (
                  <button
                    key={item.id}
                    className="recipe-history-item"
                    type="button"
                    onClick={() => {
                      setDraft({
                        patient: item.patient,
                        doctorName: item.doctorName,
                        clinicName: item.clinicName,
                        items: item.items,
                      });
                      setShowHistory(false);
                      trackGoal("recipe_history_restored", { items: item.items.length });
                    }}
                  >
                    <strong>{item.patient.name || "Без пациента"}</strong>
                    <span>{new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(item.savedAt))}</span>
                    <small>{item.items.length} назнач.</small>
                  </button>
                ))}
              </div>
            )}
          </article>
        ) : null}

        <div className="recipe-layout">
          <section className="recipe-card recipe-form">
            <h2>Пациент и врач</h2>
            <label>
              <span>Пациент</span>
              <input value={draft.patient.name} placeholder="ФИО пациента" onChange={(event) => updatePatient({ name: event.target.value })} />
            </label>
            <label>
              <span>Дата рождения</span>
              <input type="date" value={draft.patient.birthDate} onChange={(event) => updatePatient({ birthDate: event.target.value })} />
            </label>
            <label>
              <span>Диагноз / комментарий</span>
              <textarea value={draft.patient.diagnosis} placeholder="Например: F41.1 Генерализованное тревожное расстройство" onChange={(event) => updatePatient({ diagnosis: event.target.value })} />
            </label>
            <label>
              <span>Врач</span>
              <input value={draft.doctorName} placeholder="ФИО врача" onChange={(event) => setDraft((prev) => ({ ...prev, doctorName: event.target.value }))} />
            </label>
            <label>
              <span>Организация</span>
              <input value={draft.clinicName} placeholder="Название клиники" onChange={(event) => setDraft((prev) => ({ ...prev, clinicName: event.target.value }))} />
            </label>
          </section>

          <section className="recipe-card recipe-form recipe-medications">
            <div className="recipe-section-head">
              <h2>Назначения</h2>
              <button className="recipe-button" type="button" onClick={() => addItem()}>
                Добавить препарат
              </button>
            </div>

            <div className="recipe-template-row">
              {medicationTemplates.map((template) => (
                <button key={`${template.name}-${template.dosage}`} type="button" onClick={() => addItem(template)}>
                  {template.name} {template.dosage}
                </button>
              ))}
            </div>

            {draft.items.length === 0 ? (
              <div className="recipe-empty">Добавьте препарат вручную или выберите быстрый шаблон выше.</div>
            ) : (
              draft.items.map((item, index) => (
                <article className="recipe-medication" key={item.id}>
                  <div className="recipe-medication-head">
                    <strong>Назначение {index + 1}</strong>
                    <button type="button" onClick={() => removeItem(item.id)}>
                      Удалить
                    </button>
                  </div>
                  <div className="recipe-medication-grid">
                    <label>
                      <span>Препарат</span>
                      <input value={item.name} placeholder="Название" onChange={(event) => updateItem(item.id, { name: event.target.value })} />
                    </label>
                    <label>
                      <span>Форма</span>
                      <input value={item.form} placeholder="таб., капс., р-р" onChange={(event) => updateItem(item.id, { form: event.target.value })} />
                    </label>
                    <label>
                      <span>Дозировка</span>
                      <input value={item.dosage} placeholder="50 мг" onChange={(event) => updateItem(item.id, { dosage: event.target.value })} />
                    </label>
                    <label>
                      <span>Количество</span>
                      <input value={item.quantity} placeholder="30" onChange={(event) => updateItem(item.id, { quantity: event.target.value })} />
                    </label>
                    <label>
                      <span>Срок</span>
                      <input value={item.months} placeholder="1" onChange={(event) => updateItem(item.id, { months: event.target.value })} />
                    </label>
                    <label className="recipe-wide">
                      <span>Приём</span>
                      <input value={item.instructions} placeholder="по 1 таблетке утром" onChange={(event) => updateItem(item.id, { instructions: event.target.value })} />
                    </label>
                  </div>
                </article>
              ))
            )}
          </section>

          <aside className="recipe-card recipe-preview">
            <div className="recipe-preview-head">
              <h2>Предпросмотр</h2>
              <span>{selectedSummary.length} назнач.</span>
            </div>
            <div className="recipe-paper">
              <div className="recipe-paper-top">
                <strong>{draft.clinicName || "Медицинская организация"}</strong>
                <span>Рецепт</span>
              </div>
              <div className="recipe-paper-patient">
                <p><b>Пациент:</b> {draft.patient.name || "..."}</p>
                <p><b>Дата рождения:</b> {formatDate(draft.patient.birthDate) || "..."}</p>
                {draft.patient.diagnosis ? <p><b>Диагноз:</b> {draft.patient.diagnosis}</p> : null}
              </div>
              <div className="recipe-paper-list">
                {selectedSummary.length === 0 ? (
                  <p className="recipe-muted">Назначения появятся здесь.</p>
                ) : (
                  selectedSummary.map((item, index) => (
                    <div key={item.id} className="recipe-paper-item">
                      <b>{index + 1}. Rp.:</b> {renderLine(item)}
                      {item.instructions ? <span>D.S. {item.instructions}</span> : null}
                    </div>
                  ))
                )}
              </div>
              <div className="recipe-paper-footer">
                <span>Врач: {draft.doctorName || "..."}</span>
                <span>Дата: {new Intl.DateTimeFormat("ru-RU").format(new Date())}</span>
              </div>
            </div>
            <div className="recipe-preview-actions">
              <button className="recipe-button recipe-button-secondary" type="button" onClick={copyShareLink} disabled={draft.items.length === 0}>
                {shareCopied ? "Ссылка скопирована" : "Скопировать ссылку"}
              </button>
              <button className="recipe-button recipe-button-secondary" type="button" onClick={saveCurrentToHistory} disabled={draft.items.length === 0}>
                Сохранить
              </button>
              <button className="recipe-button" type="button" onClick={printRecipe} disabled={!isReadyToPrint}>
                Печать
              </button>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
