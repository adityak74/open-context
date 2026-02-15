import type {
  UserPreferences,
  NormalizedConversation,
} from '../types/preferences';
import type { VendorExporter } from './base';
import { chatGPTInfo as info } from './info';

function buildWhatToKnow(prefs: UserPreferences, conversations: NormalizedConversation[]): string {
  const lines: string[] = [];
  const { workContext, personalContext, currentFocus, technicalProfile } = prefs;

  if (workContext.role) lines.push(`I work as a ${workContext.role}.`);
  if (workContext.industry) lines.push(`Industry: ${workContext.industry}.`);
  if (workContext.description) lines.push(workContext.description);

  if (technicalProfile.experienceLevel) {
    lines.push(`My technical experience level is ${technicalProfile.experienceLevel}.`);
  }
  if (technicalProfile.primaryLanguages.length > 0) {
    lines.push(`I primarily use: ${technicalProfile.primaryLanguages.join(', ')}.`);
  }
  if (technicalProfile.frameworks.length > 0) {
    lines.push(`Frameworks I work with: ${technicalProfile.frameworks.join(', ')}.`);
  }

  if (personalContext.background) lines.push(personalContext.background);
  if (personalContext.interests.length > 0) {
    lines.push(`My interests include: ${personalContext.interests.join(', ')}.`);
  }

  if (currentFocus.projects.length > 0) {
    lines.push(`Currently working on: ${currentFocus.projects.join(', ')}.`);
  }
  if (currentFocus.goals.length > 0) {
    lines.push(`Goals: ${currentFocus.goals.join(', ')}.`);
  }
  if (currentFocus.topOfMind) lines.push(currentFocus.topOfMind);

  if (conversations.length > 0) {
    const recent = [...conversations]
      .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
      .slice(0, 3)
      .map((c) => c.title);
    lines.push(`Recent topics I've been exploring: ${recent.join('; ')}.`);
  }

  return lines.join('\n');
}

function buildHowToRespond(prefs: UserPreferences): string {
  const lines: string[] = [];
  const { communicationStyle: cs, behaviorPreferences: bp } = prefs;

  const toneMap: Record<string, string> = {
    formal: 'Use a formal, professional tone.',
    casual: 'Use a casual, conversational tone.',
    neutral: 'Use a clear, neutral tone.',
    friendly: 'Be warm and approachable.',
    professional: 'Be precise and business-oriented.',
  };
  lines.push(toneMap[cs.tone] || '');

  const detailMap: Record<string, string> = {
    concise: 'Keep responses concise and to the point.',
    balanced: 'Provide balanced responses — thorough but not verbose.',
    thorough: 'Give detailed, comprehensive explanations covering edge cases.',
  };
  lines.push(detailMap[cs.detailLevel] || '');

  if (cs.useCodeExamples) lines.push('Include code examples when relevant.');
  if (cs.preferStepByStep) lines.push('Use step-by-step instructions for complex topics.');

  if (cs.responseFormat === 'markdown') {
    lines.push('Use markdown formatting.');
  } else if (cs.responseFormat === 'plain') {
    lines.push('Use plain text without heavy formatting.');
  }

  if (bp.followUpQuestions) lines.push('Ask follow-up questions when my request is ambiguous.');
  if (bp.suggestAlternatives) lines.push('Suggest alternative approaches when relevant.');
  if (bp.warnAboutRisks) lines.push('Warn me about potential risks or pitfalls.');

  if (bp.proactiveness === 'proactive') {
    lines.push('Proactively suggest improvements beyond what I ask.');
  } else if (bp.proactiveness === 'minimal') {
    lines.push('Only answer what I specifically ask.');
  }

  if (prefs.customInstructions.trim()) {
    lines.push('');
    lines.push(prefs.customInstructions.trim());
  }

  return lines.filter(Boolean).join('\n');
}

export const chatgptExporter: VendorExporter = {
  info,
  exportPreferences(preferences) {
    return {
      vendorId: 'chatgpt',
      files: [
        {
          filename: 'chatgpt-what-to-know.txt',
          content: buildWhatToKnow(preferences, []),
          description: '"What would you like ChatGPT to know about you?"',
        },
        {
          filename: 'chatgpt-how-to-respond.txt',
          content: buildHowToRespond(preferences),
          description: '"How would you like ChatGPT to respond?"',
        },
      ],
    };
  },
  exportConversations(conversations, preferences) {
    const selected = conversations.filter((c) => c.selected);
    return {
      vendorId: 'chatgpt',
      files: [
        {
          filename: 'chatgpt-what-to-know.txt',
          content: buildWhatToKnow(preferences, selected),
          description: '"What would you like ChatGPT to know about you?"',
        },
        {
          filename: 'chatgpt-how-to-respond.txt',
          content: buildHowToRespond(preferences),
          description: '"How would you like ChatGPT to respond?"',
        },
      ],
    };
  },
};
