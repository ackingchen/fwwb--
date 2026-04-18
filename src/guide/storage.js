const GUIDE_SEEN_KEY = "uav_onboarding_seen_v1";

export function hasCompletedOnboardingGuide() {
  try {
    return localStorage.getItem(GUIDE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingGuideCompleted() {
  try {
    localStorage.setItem(GUIDE_SEEN_KEY, "1");
  } catch {
    // Ignore storage errors in private mode or restricted environments.
  }
}

export function resetOnboardingGuideCompleted() {
  try {
    localStorage.removeItem(GUIDE_SEEN_KEY);
  } catch {
    // Ignore storage errors in private mode or restricted environments.
  }
}

export { GUIDE_SEEN_KEY };
