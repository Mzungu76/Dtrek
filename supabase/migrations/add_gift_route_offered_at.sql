-- Percorso omaggio (docs/navigator-dtrek-boundary.md) — flag indipendente da onboarding_completed_at:
-- il wizard di onboarding imposta onboarding_completed_at PRIMA di offrire il regalo (vedi
-- components/onboarding/OnboardingWizard.tsx's finish()), quindi se il passo del regalo venisse
-- gestito solo lì e il browser si chiudesse a metà, non verrebbe mai più riproposto. Con un flag
-- proprio, components/onboarding/OnboardingGate.tsx può offrirlo di nuovo al prossimo accesso finché
-- non risulta impostato — a prescindere da cosa è successo al wizard del profilo.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gift_route_offered_at TIMESTAMPTZ;
