import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type {
  UserPreferences,
  NormalizedConversation,
  PipelineState,
} from '../types/preferences';

const defaultPreferences: UserPreferences = {
  communicationStyle: {
    tone: 'neutral',
    detailLevel: 'balanced',
    responseFormat: 'markdown',
    useCodeExamples: true,
    preferStepByStep: false,
    languagePreference: 'English',
  },
  technicalProfile: {
    experienceLevel: 'intermediate',
    primaryLanguages: [],
    frameworks: [],
    tools: [],
  },
  workContext: {
    role: '',
    industry: '',
    description: '',
  },
  personalContext: {
    interests: [],
    background: '',
  },
  currentFocus: {
    projects: [],
    goals: [],
    topOfMind: '',
  },
  behaviorPreferences: {
    proactiveness: 'moderate',
    followUpQuestions: true,
    suggestAlternatives: true,
    warnAboutRisks: true,
    assumeContext: false,
  },
  customInstructions: '',
};

const defaultPipeline: PipelineState = {
  stage: 'idle',
  progress: 0,
  message: '',
  conversationCount: 0,
  messageCount: 0,
};

interface AppState {
  preferences: UserPreferences;
  conversations: NormalizedConversation[];
  pipeline: PipelineState;
  prefsLoaded: boolean;
}

type AppAction =
  | { type: 'PREFS_LOADED'; payload: UserPreferences }
  | { type: 'SET_PREFERENCES'; payload: UserPreferences }
  | { type: 'UPDATE_PREFERENCES'; payload: Partial<UserPreferences> }
  | { type: 'SET_CONVERSATIONS'; payload: NormalizedConversation[] }
  | { type: 'TOGGLE_CONVERSATION'; payload: string }
  | { type: 'UPDATE_CONVERSATION'; payload: { id: string; updates: Partial<NormalizedConversation> } }
  | { type: 'DELETE_CONVERSATION'; payload: string }
  | { type: 'SET_PIPELINE'; payload: Partial<PipelineState> }
  | { type: 'RESET_PIPELINE' };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'PREFS_LOADED':
      return { ...state, preferences: action.payload, prefsLoaded: true };
    case 'SET_PREFERENCES':
      return { ...state, preferences: action.payload };
    case 'UPDATE_PREFERENCES':
      return {
        ...state,
        preferences: { ...state.preferences, ...action.payload },
      };
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.payload };
    case 'TOGGLE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.payload ? { ...c, selected: !c.selected } : c
        ),
      };
    case 'UPDATE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.payload.id ? { ...c, ...action.payload.updates } : c
        ),
      };
    case 'DELETE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.filter((c) => c.id !== action.payload),
      };
    case 'SET_PIPELINE':
      return { ...state, pipeline: { ...state.pipeline, ...action.payload } };
    case 'RESET_PIPELINE':
      return { ...state, pipeline: defaultPipeline };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

async function fetchPreferencesFromServer(): Promise<UserPreferences | null> {
  try {
    const res = await fetch('/api/preferences');
    if (!res.ok) return null;
    return (await res.json()) as UserPreferences | null;
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(preferences: UserPreferences) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences),
    }).catch(() => {});
  }, 800);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, {
    preferences: defaultPreferences,
    conversations: [],
    pipeline: defaultPipeline,
    prefsLoaded: false,
  });

  // Load preferences from server on mount
  useEffect(() => {
    fetchPreferencesFromServer().then((prefs) => {
      dispatch({ type: 'PREFS_LOADED', payload: prefs ?? defaultPreferences });
    });
  }, []);

  // Save preferences to server whenever they change (debounced, skip initial load)
  useEffect(() => {
    if (!state.prefsLoaded) return;
    scheduleSave(state.preferences);
  }, [state.preferences, state.prefsLoaded]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}

export { defaultPreferences };
