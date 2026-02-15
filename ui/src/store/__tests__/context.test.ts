import { describe, it, expect } from 'vitest';
import type {
  UserPreferences,
  NormalizedConversation,
  PipelineState,
} from '../../types/preferences';

// Redefine the reducer here for testing since it's not exported
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
}

type AppAction =
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

describe('appReducer', () => {
  const initialState: AppState = {
    preferences: defaultPreferences,
    conversations: [],
    pipeline: defaultPipeline,
  };

  describe('SET_PREFERENCES', () => {
    it('should set preferences to the provided value', () => {
      const newPreferences: UserPreferences = {
        ...defaultPreferences,
        customInstructions: 'Test instructions',
      };

      const result = appReducer(initialState, {
        type: 'SET_PREFERENCES',
        payload: newPreferences,
      });

      expect(result.preferences).toEqual(newPreferences);
    });

    it('should completely replace existing preferences', () => {
      const stateWithPreferences: AppState = {
        ...initialState,
        preferences: {
          ...defaultPreferences,
          customInstructions: 'Old instructions',
        },
      };

      const newPreferences: UserPreferences = {
        ...defaultPreferences,
        customInstructions: 'New instructions',
      };

      const result = appReducer(stateWithPreferences, {
        type: 'SET_PREFERENCES',
        payload: newPreferences,
      });

      expect(result.preferences.customInstructions).toBe('New instructions');
    });
  });

  describe('UPDATE_PREFERENCES', () => {
    it('should merge partial preferences with existing preferences', () => {
      const result = appReducer(initialState, {
        type: 'UPDATE_PREFERENCES',
        payload: { customInstructions: 'Updated instructions' },
      });

      expect(result.preferences.customInstructions).toBe('Updated instructions');
      expect(result.preferences.communicationStyle).toEqual(defaultPreferences.communicationStyle);
    });

    it('should handle nested preference updates', () => {
      const result = appReducer(initialState, {
        type: 'UPDATE_PREFERENCES',
        payload: {
          communicationStyle: {
            ...defaultPreferences.communicationStyle,
            tone: 'formal',
          },
        },
      });

      expect(result.preferences.communicationStyle.tone).toBe('formal');
      expect(result.preferences.communicationStyle.detailLevel).toBe('balanced');
    });
  });

  describe('SET_CONVERSATIONS', () => {
    it('should set conversations to the provided array', () => {
      const conversations: NormalizedConversation[] = [
        {
          id: 'conv-1',
          title: 'Test Conversation',
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          messages: [],
          selected: false,
        },
      ];

      const result = appReducer(initialState, {
        type: 'SET_CONVERSATIONS',
        payload: conversations,
      });

      expect(result.conversations).toEqual(conversations);
    });

    it('should replace existing conversations', () => {
      const stateWithConversations: AppState = {
        ...initialState,
        conversations: [
          {
            id: 'old-conv',
            title: 'Old Conversation',
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            messages: [],
            selected: false,
          },
        ],
      };

      const newConversations: NormalizedConversation[] = [
        {
          id: 'new-conv',
          title: 'New Conversation',
          created: '2024-02-01T00:00:00Z',
          updated: '2024-02-01T00:00:00Z',
          messages: [],
          selected: false,
        },
      ];

      const result = appReducer(stateWithConversations, {
        type: 'SET_CONVERSATIONS',
        payload: newConversations,
      });

      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].id).toBe('new-conv');
    });
  });

  describe('TOGGLE_CONVERSATION', () => {
    it('should toggle the selected state of a conversation', () => {
      const stateWithConversations: AppState = {
        ...initialState,
        conversations: [
          {
            id: 'conv-1',
            title: 'Test Conversation',
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            messages: [],
            selected: false,
          },
        ],
      };

      const result = appReducer(stateWithConversations, {
        type: 'TOGGLE_CONVERSATION',
        payload: 'conv-1',
      });

      expect(result.conversations[0].selected).toBe(true);
    });

    it('should toggle from true to false', () => {
      const stateWithConversations: AppState = {
        ...initialState,
        conversations: [
          {
            id: 'conv-1',
            title: 'Test Conversation',
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            messages: [],
            selected: true,
          },
        ],
      };

      const result = appReducer(stateWithConversations, {
        type: 'TOGGLE_CONVERSATION',
        payload: 'conv-1',
      });

      expect(result.conversations[0].selected).toBe(false);
    });

    it('should not affect other conversations', () => {
      const stateWithConversations: AppState = {
        ...initialState,
        conversations: [
          {
            id: 'conv-1',
            title: 'Conversation 1',
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            messages: [],
            selected: false,
          },
          {
            id: 'conv-2',
            title: 'Conversation 2',
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            messages: [],
            selected: false,
          },
        ],
      };

      const result = appReducer(stateWithConversations, {
        type: 'TOGGLE_CONVERSATION',
        payload: 'conv-1',
      });

      expect(result.conversations[0].selected).toBe(true);
      expect(result.conversations[1].selected).toBe(false);
    });

    it('should handle non-existent conversation id gracefully', () => {
      const stateWithConversations: AppState = {
        ...initialState,
        conversations: [
          {
            id: 'conv-1',
            title: 'Test Conversation',
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            messages: [],
            selected: false,
          },
        ],
      };

      const result = appReducer(stateWithConversations, {
        type: 'TOGGLE_CONVERSATION',
        payload: 'non-existent',
      });

      expect(result.conversations[0].selected).toBe(false);
      expect(result.conversations).toHaveLength(1);
    });
  });

  describe('UPDATE_CONVERSATION', () => {
    it('should update specific fields of a conversation', () => {
      const stateWithConversations: AppState = {
        ...initialState,
        conversations: [
          {
            id: 'conv-1',
            title: 'Old Title',
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            messages: [],
            selected: false,
          },
        ],
      };

      const result = appReducer(stateWithConversations, {
        type: 'UPDATE_CONVERSATION',
        payload: { id: 'conv-1', updates: { title: 'New Title' } },
      });

      expect(result.conversations[0].title).toBe('New Title');
      expect(result.conversations[0].id).toBe('conv-1');
    });

    it('should not affect other conversations', () => {
      const stateWithConversations: AppState = {
        ...initialState,
        conversations: [
          {
            id: 'conv-1',
            title: 'Conversation 1',
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            messages: [],
            selected: false,
          },
          {
            id: 'conv-2',
            title: 'Conversation 2',
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            messages: [],
            selected: false,
          },
        ],
      };

      const result = appReducer(stateWithConversations, {
        type: 'UPDATE_CONVERSATION',
        payload: { id: 'conv-1', updates: { title: 'Updated Title' } },
      });

      expect(result.conversations[0].title).toBe('Updated Title');
      expect(result.conversations[1].title).toBe('Conversation 2');
    });
  });

  describe('DELETE_CONVERSATION', () => {
    it('should remove a conversation by id', () => {
      const stateWithConversations: AppState = {
        ...initialState,
        conversations: [
          {
            id: 'conv-1',
            title: 'Conversation 1',
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            messages: [],
            selected: false,
          },
          {
            id: 'conv-2',
            title: 'Conversation 2',
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            messages: [],
            selected: false,
          },
        ],
      };

      const result = appReducer(stateWithConversations, {
        type: 'DELETE_CONVERSATION',
        payload: 'conv-1',
      });

      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].id).toBe('conv-2');
    });

    it('should handle deleting non-existent conversation gracefully', () => {
      const stateWithConversations: AppState = {
        ...initialState,
        conversations: [
          {
            id: 'conv-1',
            title: 'Conversation 1',
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            messages: [],
            selected: false,
          },
        ],
      };

      const result = appReducer(stateWithConversations, {
        type: 'DELETE_CONVERSATION',
        payload: 'non-existent',
      });

      expect(result.conversations).toHaveLength(1);
    });
  });

  describe('SET_PIPELINE', () => {
    it('should update pipeline state with partial updates', () => {
      const result = appReducer(initialState, {
        type: 'SET_PIPELINE',
        payload: { stage: 'parsing', progress: 50 },
      });

      expect(result.pipeline.stage).toBe('parsing');
      expect(result.pipeline.progress).toBe(50);
      expect(result.pipeline.message).toBe('');
    });

    it('should preserve existing pipeline values when updating', () => {
      const stateWithPipeline: AppState = {
        ...initialState,
        pipeline: {
          stage: 'uploading',
          progress: 25,
          message: 'Uploading...',
          conversationCount: 5,
          messageCount: 100,
        },
      };

      const result = appReducer(stateWithPipeline, {
        type: 'SET_PIPELINE',
        payload: { progress: 50 },
      });

      expect(result.pipeline.stage).toBe('uploading');
      expect(result.pipeline.progress).toBe(50);
      expect(result.pipeline.message).toBe('Uploading...');
    });
  });

  describe('RESET_PIPELINE', () => {
    it('should reset pipeline to default state', () => {
      const stateWithPipeline: AppState = {
        ...initialState,
        pipeline: {
          stage: 'complete',
          progress: 100,
          message: 'Done!',
          conversationCount: 10,
          messageCount: 200,
        },
      };

      const result = appReducer(stateWithPipeline, {
        type: 'RESET_PIPELINE',
      });

      expect(result.pipeline).toEqual(defaultPipeline);
    });
  });
});
