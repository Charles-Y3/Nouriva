import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useT } from '../../hooks/useT';
import type { Draft } from '../../types';
import StepDishName from './StepDishName';
import StepPhoto from './StepPhoto';
import StepReflection from './StepReflection';
import StepSpiritTags from './StepSpiritTags';
import StepShare from './StepShare';

function newDraft(): Draft {
  const now = Date.now();
  return {
    id: 'draft_' + now,
    dishName: '',
    reflection: '',
    ingredients: '',
    recipe: '',
    spiritTags: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function CreateView({
  resumeDraftId,
  onDone,
}: {
  resumeDraftId?: string;
  onDone: () => void;
}) {
  const { drafts, saveDraft } = useApp();
  const t = useT();
  const STEPS = [t.create.photo.title, t.create.dishName.title, t.create.reflection.title, t.create.tags.title, t.create.share.title];
  const [draft, setDraft] = useState<Draft>(() => {
    if (resumeDraftId) {
      const found = drafts.find(d => d.id === resumeDraftId);
      if (found) return found;
    }
    return newDraft();
  });
  const [step, setStep] = useState(0);

  // Re-sync if the resumed draft id changes (e.g. tapping a different
  // draft from My Nouriva while Create is already mounted).
  useEffect(() => {
    if (resumeDraftId) {
      const found = drafts.find(d => d.id === resumeDraftId);
      if (found) setDraft(found);
      setStep(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeDraftId]);

  // Deliberately not a functional setDraft(prev => ...) updater — calling
  // saveDraft (AppContext's setDrafts) from inside a state-updater function
  // runs it during React's render phase for this component, which React
  // flags as "Cannot update a component while rendering a different
  // component." Computing `next` from the current `draft` closure instead
  // keeps the AppContext write a plain side effect of the event handler.
  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    saveDraft(next);
  }

  function goNext() {
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }
  function goBack() {
    setStep(s => Math.max(s - 1, 0));
  }

  return (
    <div className="pt-4 pb-8">
      <div className="flex items-center gap-1.5 mb-6">
        {STEPS.map((label, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-clay-600' : 'bg-linen-200'}`}
            title={label}
          />
        ))}
      </div>

      {step === 0 && <StepPhoto draft={draft} update={update} onNext={goNext} />}
      {step === 1 && <StepDishName draft={draft} update={update} onNext={goNext} onBack={goBack} />}
      {step === 2 && <StepReflection draft={draft} update={update} onNext={goNext} onBack={goBack} />}
      {step === 3 && <StepSpiritTags draft={draft} update={update} onNext={goNext} onBack={goBack} />}
      {step === 4 && <StepShare draft={draft} onBack={goBack} onDone={onDone} />}
    </div>
  );
}
