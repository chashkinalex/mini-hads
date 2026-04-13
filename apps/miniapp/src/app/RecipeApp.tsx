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
const RECIPE_APP_VERSION = "2026-04-13.1";

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

function getReleaseLine(items: PrescriptionItem[]) {
  const firstItem = items[0];
  if (!firstItem) return "ОТПУСКАТЬ ПО __________ ЕЖЕМЕСЯЧНО";

  const quantity = firstItem.quantity ? `${firstItem.quantity} ` : "";
  const form = firstItem.form || "уп.";
  return `ОТПУСКАТЬ ПО ${quantity}${form.toUpperCase()} ЕЖЕМЕСЯЧНО`;
}

function shouldLimitFrontSideToTwo(items: PrescriptionItem[]) {
  const firstThree = items.slice(0, 3);
  if (firstThree.length < 3) return false;

  const hasLongInstruction = firstThree
    .slice(0, 2)
    .some((item) => item.instructions.trim().length > 56 || renderLine(item).length > 62);

  const combinedInstructionLength = firstThree
    .slice(0, 2)
    .reduce((sum, item) => sum + item.instructions.trim().length, 0);

  return hasLongInstruction || combinedInstructionLength > 88;
}

function getPrintableItems(items: PrescriptionItem[]) {
  if (items.length === 0) return [];
  const limit = shouldLimitFrontSideToTwo(items) ? 2 : 3;
  return items.slice(0, limit);
}

export function RecipeApp() {
  const [draft, setDraft] = useState<RecipeDraft>(() => getImportedDraft() ?? initialDraft);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [showHistory, setShowHistory] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const isReadyToPrint = draft.patient.name.trim() && draft.patient.birthDate.trim() && draft.doctorName.trim() && draft.items.length > 0;

  const selectedSummary = useMemo(() => draft.items.filter((item) => item.name.trim()), [draft.items]);
  const printableItems = useMemo(() => getPrintableItems(selectedSummary), [selectedSummary]);
  const printableSlots = useMemo(
    () => Array.from({ length: 3 }, (_, index) => printableItems[index] ?? null),
    [printableItems],
  );
  const hiddenItemsCount = Math.max(0, selectedSummary.length - printableItems.length);

  useEffect(() => {
    document.title = "Рецепты";
    trackGoal("recipe_app_opened", { items: draft.items.length, version: RECIPE_APP_VERSION });
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
              <span>{printableItems.length} из {selectedSummary.length}</span>
            </div>
            <div className="recipe-paper-stack">
              <div className="recipe-paper recipe-paper-front">
                <div className="rx-official-head">
                  <div>
                    <span>Министерство здравоохранения</span>
                    <span>Российской Федерации</span>
                    <br />
                    <span>Наименование медицинской организации</span>
                    <strong>{draft.clinicName || "________________________"}</strong>
                  </div>
                  <div>
                    <span>Код формы по ОКУД</span>
                    <span>Код учреждения по ОКПО</span>
                    <br />
                    <span>Медицинская документация</span>
                    <strong>Форма N 107-1/у</strong>
                  </div>
                </div>
                <div className="rx-special-purpose">ПО СПЕЦИАЛЬНОМУ НАЗНАЧЕНИЮ</div>
                <div className="rx-series-row">
                  <span>РЕЦЕПТ</span>
                  <span>серия _________ N _________</span>
                  <span>«{new Intl.DateTimeFormat("ru-RU", { day: "2-digit" }).format(new Date())}» __________ 20__ г.</span>
                </div>
                <div className="rx-patient-block">
                  <p>
                    <span>Фамилия, инициалы имени и отчества пациента</span>
                    <strong>{draft.patient.name || "____________________________"}</strong>
                  </p>
                  <p>
                    <span>Дата рождения</span>
                    <strong>{formatDate(draft.patient.birthDate) || "____________________________"}</strong>
                  </p>
                </div>
                <div className="rx-prescription-list">
                  {printableSlots.map((item, index) =>
                    item ? (
                      <div key={item.id} className="rx-prescription-block">
                        <div className="rx-rp-line">руб.|коп.| Rp.</div>
                        <p>
                          <b>{index + 1}.</b> {renderLine(item)}
                        </p>
                        <p>D.t.d. N {item.quantity || "___"}</p>
                        {item.instructions ? <p>S. {item.instructions}</p> : <p>S. ________________________________</p>}
                      </div>
                    ) : (
                      <div key={`empty-${index}`} className="rx-prescription-block rx-prescription-block-empty">
                        <div className="rx-rp-line">руб.|коп.| Rp.</div>
                        <p>________________________________</p>
                        <p>D.t.d. N ________________________</p>
                        <p>S. ________________________________</p>
                      </div>
                    ),
                  )}
                </div>
                <div className="rx-release-line">{getReleaseLine(printableItems)}</div>
                <div className="rx-footer">
                  <div>
                    <span>Подпись</span>
                    <strong>________________________</strong>
                  </div>
                  <div>
                    <span>М.П.</span>
                  </div>
                  <div>
                    <span>Фамилия лечащего врача</span>
                    <strong>{draft.doctorName || "________________________"}</strong>
                  </div>
                  <div>
                    <span>Рецепт действителен</span>
                    <strong>90 дней</strong>
                  </div>
                </div>
              </div>
              <div className="recipe-paper recipe-paper-back print-only">
                <div className="rx-back-commission">
                  <span>Отметка о назначении лекарственного препарата по решению врачебной комиссии</span>
                  <div className="rx-back-commission-line" />
                </div>
                <div className="rx-back-signatures">
                  <div>
                    <span>Приготовил</span>
                    <strong>________________________</strong>
                  </div>
                  <div>
                    <span>Проверил</span>
                    <strong>________________________</strong>
                  </div>
                  <div>
                    <span>Отпустил</span>
                    <strong>________________________</strong>
                  </div>
                </div>
              </div>
            </div>
            {hiddenItemsCount > 0 ? (
              <p className="recipe-truncate-note">На один бланк помещаются первые {printableItems.length} назначения. Остальные лучше оформить отдельным рецептом.</p>
            ) : null}
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
            <p className="recipe-print-note">Для печати: A4, поля 0, колонтитулы браузера отключены.</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
