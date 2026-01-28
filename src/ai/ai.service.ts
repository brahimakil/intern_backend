import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase/firebase.service';
import { ChatDto } from './dto/chat.dto';
import { AnalyzeCVDto } from './dto/analyze-cv.dto';
import { InternshipAssistantDto } from './dto/internship-assistant.dto';
import * as admin from 'firebase-admin';
import { OpenAI } from 'openai';

// AI Model configuration
const AI_MODEL = 'deepseek-ai/DeepSeek-V3.2:novita';

@Injectable()
export class AiService {
  private openai: OpenAI;
  private readonly hfApiKey: string;

  constructor(
    private firebaseService: FirebaseService,
    private configService: ConfigService,
  ) {
    // Get HF_TOKEN from ConfigService
    this.hfApiKey = this.configService.get<string>('HF_TOKEN') || '';

    // Validate HF_TOKEN exists
    if (!this.hfApiKey) {
      throw new Error('HF_TOKEN environment variable is required for AI service');
    }

    // Initialize OpenAI client with HuggingFace endpoint
    this.openai = new OpenAI({
      baseURL: 'https://router.huggingface.co/v1',
      apiKey: this.hfApiKey,
    });

    console.log('AI Service initialized successfully with HuggingFace');
  }

  /**
   * Generate AI response using HuggingFace DeepSeek model
   */
  private async generateAIResponse(prompt: string): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    return response.choices[0]?.message?.content || '';
  }

  /**
   * Get student profile data
   */
  private async getStudentProfile(studentId: string): Promise<any> {
    const firestore = this.firebaseService.firestore;
    const docRef = firestore.collection('students').doc(studentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Student not found');
    }

    const data = doc.data();
    if (!data) {
      throw new Error('Student data not found');
    }

    return {
      id: studentId,
      email: data.email,
      fullName: data.fullName,
      major: data.major,
      address: data.address || '',
      cvUrl: data.cvUrl || data.resumeUrl || '',
      profilePhotoUrl: data.profilePhotoUrl || '',
      cvParsedData: data.cvParsedData || null,
      cvLastUpdated: data.cvLastUpdated || null,
    };
  }

  /**
   * Build context from student CV and internships
   */
  private async buildContext(student: any) {
    const firestore = this.firebaseService.firestore;

    let context = `Student Profile:\n`;
    context += `Name: ${student.fullName}\n`;
    context += `Major: ${student.major}\n`;

    if (student.cvParsedData) {
      const parsed = student.cvParsedData;

      if (parsed.skills && parsed.skills.length > 0) {
        context += `Skills: ${parsed.skills.join(', ')}\n`;
      }

      if (parsed.interests && parsed.interests.length > 0) {
        context += `Interests: ${parsed.interests.join(', ')}\n`;
      }

      if (parsed.experience && parsed.experience.length > 0) {
        context += `\nExperience:\n`;
        for (const exp of parsed.experience) {
          context += `- ${exp.title} at ${exp.company} (${exp.duration})\n`;
        }
      }

      if (parsed.education && parsed.education.length > 0) {
        context += `\nEducation:\n`;
        for (const edu of parsed.education) {
          context += `- ${edu.degree} from ${edu.institution}\n`;
        }
      }
    }

    return context;
  }

  /**
   * Get relevant internships based on student profile
   */
  private async getRelevantInternships(student: any, limit = 10): Promise<any[]> {
    const firestore = this.firebaseService.firestore;

    // Fetch open internships
    const internshipsSnapshot = await firestore
      .collection('internships')
      .where('status', '==', 'open')
      .limit(limit)
      .get();

    const internships: any[] = [];
    for (const doc of internshipsSnapshot.docs) {
      const data = doc.data();

      // Fetch company details including industry
      let companyName = 'Unknown Company';
      let companyIndustry = 'Not specified';
      if (data.companyId) {
        const companyDoc = await firestore.collection('companies').doc(data.companyId).get();
        if (companyDoc.exists) {
          const companyData = companyDoc.data();
          companyName = companyData?.name || companyName;
          companyIndustry = companyData?.industry || companyIndustry;
        }
      }

      internships.push({
        id: doc.id,
        title: data.title,
        company: companyName,
        industry: companyIndustry,
        description: data.description,
        location: data.location,
        duration: data.duration,
        skills: data.requiredSkills || [],
      });
    }

    return internships;
  }

  /**
   * Chat with AI - General conversation and recommendations
   */
  async chat(chatDto: ChatDto) {
    try {
      const student = await this.getStudentProfile(chatDto.studentId);
      const firestore = this.firebaseService.firestore;

      const message = chatDto.message.toLowerCase().trim();
      const originalContext = chatDto.context || '';
      const contextLower = originalContext.toLowerCase();

      // ========================================================
      // STEP 1: Detect if this is a confirmation of pending apply
      // ========================================================
      // Use regex with global flag to find all matches, then pick the last one (most recent)
      // Handles both quoted and unquoted titles (e.g. "Software Intern" or Software Intern)
      const allPendingMatches = Array.from(originalContext.matchAll(/would you like me to apply for (?:the )?(?:["'](.+?)["']|([^"?.]+))/gi));
      const lastPendingMatch = allPendingMatches.length > 0 ? allPendingMatches[allPendingMatches.length - 1] : null;

      // Extract the text from whichever group matched (quoted or unquoted)
      const confirmedInternshipText = lastPendingMatch ? (lastPendingMatch[1] || lastPendingMatch[2]) : null;

      const isPendingConfirmation = confirmedInternshipText &&
        (message === 'yes' || message === 'yes please' || message === 'yes, apply' ||
          message === 'confirm' || message === 'yes, confirm' || message === 'sure' ||
          message === 'ok' || message === 'okay' || message === 'go ahead');

      // ========================================================
      // STEP 2: Detect explicit application request
      // ========================================================
      const explicitApplyPattern = /(?:apply|enroll|submit|sign up|register|let'?s?\s*(?:go|apply))\s+(?:for|to|in|with)?\s*(?:the\s+)?["']?(.+?)["']?\s*(?:internship|position|job|opportunity)?$/i;
      const explicitApplyMatch = message.match(explicitApplyPattern);
      const hasExplicitRequest = !!explicitApplyMatch;

      // Determine if we should process an application
      const isApplyingForInternship = isPendingConfirmation || hasExplicitRequest;

      // ========================================================
      // STEP 3: Check if asking about internships (but NOT applying)
      // ========================================================
      const isAskingAboutInternships = !isApplyingForInternship && (
        message.includes('internship') ||
        message.includes('job') ||
        message.includes('position') ||
        message.includes('opportunity') ||
        message.includes('recommend') ||
        message.includes('suggest') ||
        message.includes('find') ||
        message.includes('search') ||
        message.includes('look') ||
        message.includes('company') ||
        message.includes('companies') ||
        message.includes('close to my major') ||
        message.includes('related to') ||
        message.includes('near me') ||
        message.includes('close to me') ||
        message.includes('my location') ||
        message.includes('my address') ||
        message.includes('nearby') ||
        message.includes('tell me about') ||
        message.includes('explain') ||
        message.includes('details') ||
        message.includes('describe') ||
        message.includes('info about')
      );

      // Build rich student profile context
      const studentProfileContext = await this.buildContext(student);

      let prompt = '';

      // ========================================================
      // HANDLE APPLICATION FLOW
      // ========================================================
      if (isApplyingForInternship) {
        // Fetch all open internships
        const internshipsSnapshot = await firestore
          .collection('internships')
          .where('status', '==', 'open')
          .get();

        let targetInternship: any = null;

        // Fetch companies
        const companyIds = [...new Set(internshipsSnapshot.docs.map(d => d.data().companyId).filter(Boolean))];
        const companyMap = new Map<string, string>();

        if (companyIds.length > 0) {
          await Promise.all(companyIds.map(async (id) => {
            const snap = await firestore.collection('companies').doc(id).get();
            const data = snap.data();
            if (snap.exists && data) {
              companyMap.set(String(id), data.name);
            }
          }));
        }

        // Build candidates with normalized names
        const candidates = internshipsSnapshot.docs.map(doc => {
          const data = doc.data();
          const companyName = companyMap.get(data.companyId) || 'Unknown Company';
          return {
            id: doc.id,
            title: data.title,
            titleLower: data.title.toLowerCase(),
            company: companyName,
            companyLower: companyName.toLowerCase(),
            fullName: `${data.title} at ${companyName}`.toLowerCase(),
            originalData: data
          };
        });

        // ========================================================
        // PRIORITY 1: If user is CONFIRMING a previous application prompt
        // Extract the internship name from "Would you like me to apply for 'X'?"
        // ========================================================
        if (isPendingConfirmation && confirmedInternshipText) {
          const confirmedTitle = confirmedInternshipText.toLowerCase().trim();
          console.log(`[AI] User confirmed application for: "${confirmedTitle}"`);

          // Find the internship that matches the confirmed title using a simple scoring system
          let bestMatch: any = null;
          let highestScore = 0;

          for (const candidate of candidates) {
            let score = 0;
            const confirmedTitleNormalized = confirmedTitle.toLowerCase();

            // Exact full name match is best
            if (candidate.fullName === confirmedTitleNormalized) {
              score = 100;
            }
            // Exact title match is second best
            else if (candidate.titleLower === confirmedTitleNormalized) {
              score = 90;
            }
            // Full name includes confirmed title
            else if (candidate.fullName.includes(confirmedTitleNormalized)) {
              score = 80;
            }
            // Title includes confirmed title
            else if (candidate.titleLower.includes(confirmedTitleNormalized)) {
              score = 70;
            }
            // Confirmed title includes title
            else if (confirmedTitleNormalized.includes(candidate.titleLower)) {
              score = 60;
            }

            if (score > highestScore) {
              highestScore = score;
              bestMatch = candidate;
            }
          }

          if (bestMatch && highestScore >= 60) {
            targetInternship = { id: bestMatch.id, ...bestMatch.originalData };
            console.log(`[AI] Confirmed match found: "${bestMatch.title}" at "${bestMatch.company}" (Score: ${highestScore})`);
          }

          // If we found a match from confirmation, skip all other matching logic
          if (targetInternship) {
            // Go directly to duplicate check and enrollment (handled below)
          }
        }

        // ========================================================
        // PRIORITY 2: EXTRACT NUMBERED LIST FROM AI's PREVIOUS RESPONSE
        // ========================================================
        // Only do this if we haven't found target from confirmation
        if (!targetInternship) {
          // The AI formats responses like:
          // "1. **Software developer internship at Iphone company** - description"
          // or "1. **Title** at **Company** - description"
          // We need to extract these and map ordinals to actual internships

          const extractedList: { num: number; text: string }[] = [];

          // Multiple patterns to catch different AI response formats
          const patterns = [
            // Pattern: "1. **Title at Company**" or "1. **Title**"
            /(\d+)\.\s*\*\*([^*]+)\*\*/gi,
            // Pattern: "1. Title at Company -" or "1. Title at Company ("
            /(\d+)\.\s*([^(\n*-]+?)(?:\s*[-(\n]|$)/gi,
          ];

          for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(originalContext)) !== null) {
              const num = parseInt(match[1]);
              const text = match[2].trim().toLowerCase();
              // Avoid duplicates
              if (!extractedList.find(e => e.num === num)) {
                extractedList.push({ num, text });
              }
            }
          }

          // Sort by number
          extractedList.sort((a, b) => a.num - b.num);

          // ========================================================
          // DETECT ORDINAL REFERENCE: "first one", "second one", "#1"
          // ========================================================
          const ordinalPatterns = [
            { pattern: /(?:the\s+)?(?:first|1st|#\s*1|number\s*1|option\s*1|one)\s*(?:one)?/i, index: 0 },
            { pattern: /(?:the\s+)?(?:second|2nd|#\s*2|number\s*2|option\s*2|two)\s*(?:one)?/i, index: 1 },
            { pattern: /(?:the\s+)?(?:third|3rd|#\s*3|number\s*3|option\s*3|three)\s*(?:one)?/i, index: 2 },
            { pattern: /(?:the\s+)?(?:fourth|4th|#\s*4|number\s*4|option\s*4|four)\s*(?:one)?/i, index: 3 },
            { pattern: /(?:the\s+)?(?:fifth|5th|#\s*5|number\s*5|option\s*5|five)\s*(?:one)?/i, index: 4 },
          ];

          let ordinalIndex = -1;
          for (const { pattern, index } of ordinalPatterns) {
            if (pattern.test(message)) {
              ordinalIndex = index;
              break;
            }
          }

          // If user used ordinal reference
          if (ordinalIndex >= 0 && extractedList.length > 0) {
            const targetNum = ordinalIndex + 1;
            const targetItem = extractedList.find(e => e.num === targetNum);

            if (targetItem) {
              console.log(`[AI] User wants item #${targetNum}: "${targetItem.text}"`);

              // Find best matching candidate
              let bestMatch: any = null;
              let bestScore = 0;

              for (const candidate of candidates) {
                let score = 0;

                // Exact match gets highest score
                if (candidate.fullName === targetItem.text) {
                  score = 100;
                }
                // Check if extracted text contains title and company
                else if (targetItem.text.includes(candidate.titleLower) && targetItem.text.includes(candidate.companyLower)) {
                  score = 90;
                }
                // Check if title matches
                else if (targetItem.text.includes(candidate.titleLower) || candidate.titleLower.includes(targetItem.text)) {
                  score = 70;
                }
                // Check if company matches
                else if (targetItem.text.includes(candidate.companyLower)) {
                  score = 50;
                }
                // Partial word matching
                else {
                  const targetWords = targetItem.text.split(/\s+/);
                  const candidateWords = candidate.fullName.split(/\s+/);
                  const matchingWords = targetWords.filter(w => w.length > 2 && candidateWords.some(cw => cw.includes(w) || w.includes(cw)));
                  score = matchingWords.length * 10;
                }

                if (score > bestScore) {
                  bestScore = score;
                  bestMatch = candidate;
                }
              }

              if (bestMatch && bestScore >= 30) {
                console.log(`[AI] Matched to: "${bestMatch.title}" at "${bestMatch.company}" (score: ${bestScore})`);
                targetInternship = { id: bestMatch.id, ...bestMatch.originalData };
              }
            }
          }

          // Try semantic matching using OpenAI
          if (!targetInternship) {
            try {
              const candidateList = candidates.map(c => `ID: ${c.id}, Title: ${c.title}, Company: ${c.company}`).join('\n');
              const aiMatchResponse = await this.openai.chat.completions.create({
                model: AI_MODEL,
                messages: [
                  {
                    role: 'system',
                    content: 'You are a matching engine. Your task is to identify the EXACT internship ID the user wants to apply for based on their request. Return ONLY the ID or the word "NONE" if no match is found. Do not explain.'
                  },
                  {
                    role: 'user',
                    content: `User Request: "${message}"\n\nAvailable Internships:\n${candidateList}\n\nMatching ID:`
                  }
                ],
                temperature: 0,
              });

              const matchedId = aiMatchResponse.choices[0]?.message?.content?.trim();
              if (matchedId && matchedId !== 'NONE') {
                const match = candidates.find(c => c.id === matchedId || matchedId.includes(c.id));
                if (match) {
                  targetInternship = { id: match.id, ...match.originalData };
                  console.log(`[AI] Semantic match found via AI: "${match.title}" at "${match.company}"`);
                }
              }
            } catch (aiError) {
              console.error('Semantic matching error:', aiError);
            }
          }

          // If semantic matching failed, use the scoring logic
          if (!targetInternship) {
            // Priority: Use the capture group from our regex match if it exists
            let searchText = explicitApplyMatch?.[1]?.trim() || '';

            // Fallback to the manual cleanup if regex capture was empty
            if (!searchText) {
              searchText = message
                .replace(/(?:apply|enroll|submit|sign up|register|let'?s?\s*(?:go|apply))\s+(?:for|to|in|with)?\s*/gi, '')
                .replace(/(?:the\s+)?(?:internship|position|job|opportunity)/gi, '')
                .trim();
            }

            // Cleanup noise words at the start (e.g., "in software", "to software", "at mobile")
            searchText = searchText.replace(/^(?:in|to|at|for|the|a|an)\s+/i, '').trim();

            if (searchText.length > 2) {
              let bestDirectMatch: any = null;
              let highestDirectScore = 0;

              for (const candidate of candidates) {
                let score = 0;
                const searchLower = searchText.toLowerCase();

                // 1. Exact full name match
                if (candidate.fullName === searchLower) {
                  score = 100;
                }
                // 2. Exact title match
                else if (candidate.titleLower === searchLower) {
                  score = 90;
                }
                // 3. Both title and company mentioned (Check for word boundaries)
                else {
                  const titleWords = candidate.titleLower.split(/\s+/).filter(w => w.length > 0);
                  const companyWords = candidate.companyLower.split(/\s+/).filter(w => w.length > 0);

                  const hasAllTitleWords = titleWords.every(word =>
                    new RegExp(`\\b${word}\\b`, 'i').test(searchLower)
                  );

                  const hasAllCompanyWords = companyWords.every(word =>
                    new RegExp(`\\b${word}\\b`, 'i').test(searchLower)
                  );

                  if (hasAllTitleWords && hasAllCompanyWords) {
                    score = 85;
                  } else if (hasAllTitleWords) {
                    score = 70;
                  } else if (hasAllCompanyWords) {
                    score = 40;
                  }
                }

                if (score > highestDirectScore) {
                  highestDirectScore = score;
                  bestDirectMatch = candidate;
                }
              }

              if (bestDirectMatch && highestDirectScore >= 70) {
                targetInternship = { id: bestDirectMatch.id, ...bestDirectMatch.originalData };
                console.log(`[AI] Direct match found by scoring: "${bestDirectMatch.title}" at "${bestDirectMatch.company}" (Score: ${highestDirectScore})`);
              }
            }
          }

          // Final fallback: search context for ANY candidate title (least reliable)
          if (!targetInternship) {
            // Only do this if the context explicitly mentions the internship
            for (const candidate of candidates) {
              // Check if this specific internship was mentioned in context
              if (contextLower.includes(candidate.titleLower) && contextLower.includes(candidate.companyLower)) {
                targetInternship = { id: candidate.id, ...candidate.originalData };
                console.log(`[AI] Context fallback match: "${candidate.title}" at "${candidate.company}"`);
                break;
              }
            }
          }
        } // End of "if (!targetInternship)" block from PRIORITY 2

        if (!targetInternship) {
          return {
            response: "I couldn't identify which internship you want to apply for. Please specify the exact internship title and company, for example: \"Apply for Software Developer Intern at Iphone company\".",
          };
        }

        // ========================================================
        // DUPLICATE CHECK
        // ========================================================
        const existingEnrollments = await firestore
          .collection('enrollments')
          .where('studentId', '==', chatDto.studentId)
          .where('internshipId', '==', targetInternship.id)
          .get();

        if (!existingEnrollments.empty) {
          const enrollment = existingEnrollments.docs[0].data();
          return {
            response: `You have already applied for "${targetInternship.title}". Your current application status is: **${enrollment.status}**. You can check your applications in the "My Internships" section.`,
          };
        }

        // Get company name for confirmation message
        const targetCompanyName = companyMap.get(targetInternship.companyId) || 'the company';

        // If explicit request, ask for confirmation first
        if (hasExplicitRequest && !isPendingConfirmation) {
          return {
            response: `Would you like me to apply for "${targetInternship.title}" at ${targetCompanyName}? Reply "yes" to confirm.`,
          };
        }

        // Proceed with application
        try {
          const nowISO = new Date().toISOString();
          await firestore.collection('enrollments').add({
            studentId: chatDto.studentId,
            internshipId: targetInternship.id,
            companyId: targetInternship.companyId,
            status: 'pending',
            enrolledDate: nowISO,
            createdAt: nowISO,
            updatedAt: nowISO,
          });

          return {
            response: `Great! I've successfully submitted your application for "${targetInternship.title}" at ${targetCompanyName}. You can check your application status in the "My Internships" section. Good luck!`,
          };
        } catch (error) {
          return {
            response: `Sorry, I encountered an error while submitting your application. Please try applying through the Browse Internships page.`,
          };
        }
      }

      // ========================================================
      // HANDLE INTERNSHIP INQUIRIES (without applying)
      // ========================================================
      if (isAskingAboutInternships) {
        // Fetch internships with company industries
        const internships = await this.getRelevantInternships(student, 15);

        // Check if user is asking about location-based internships
        const isAskingAboutLocation = message.includes('near') ||
          message.includes('close to me') ||
          message.includes('my location') ||
          message.includes('my address') ||
          message.includes('nearby');

        if (isAskingAboutLocation) {
          // Get student's address
          const studentAddress = student.address || '';

          if (!studentAddress) {
            return {
              response: 'You haven\'t added your address to your profile yet. Please update your address in the Profile section to get location-based internship recommendations.',
            };
          }

          // Categorize internships by location match and major match
          const sameLocationSameMajor: any[] = [];
          const sameLocationDifferentMajor: any[] = [];
          const otherInternships: any[] = [];

          for (const internship of internships) {
            const locationMatch = this.isLocationMatch(studentAddress, internship.location);
            const majorMatch = this.isMajorMatch(student.major, internship.industry);

            if (locationMatch && majorMatch) {
              sameLocationSameMajor.push(internship);
            } else if (locationMatch && !majorMatch) {
              sameLocationDifferentMajor.push(internship);
            } else {
              otherInternships.push(internship);
            }
          }

          let locationPrompt = `You are a helpful internship career assistant for ${student.fullName}, a ${student.major} student.

${studentProfileContext}

Student's address: ${studentAddress}

Internships near the student's location that match their major (${student.major}):
${sameLocationSameMajor.length > 0 ? sameLocationSameMajor.map(i => `- ${i.title} at ${i.company} (Industry: ${i.industry}, Location: ${i.location})`).join('\n') : 'None found'}

Internships near the student's location but NOT matching their major:
${sameLocationDifferentMajor.length > 0 ? sameLocationDifferentMajor.map(i => `- ${i.title} at ${i.company} (Industry: ${i.industry}, Location: ${i.location})`).join('\n') : 'None found'}

User question: ${chatDto.message}

Provide a concise response (3-4 sentences). First recommend internships near their location that match their major. If there are nearby internships that don't match their major, mention them as alternative options. Keep it brief. Do NOT apply for any internship - only recommend. If the user wants to apply, tell them to say "Apply for [internship title]".`;

          const responseText = await this.generateAIResponse(locationPrompt);

          return {
            response: responseText,
          };
        }

        prompt = `You are a helpful internship career assistant for ${student.fullName}, a ${student.major} student.

${studentProfileContext}

Conversation context:
${chatDto.context || 'No previous context'}

Available Internships:
${internships.map(i => `- ${i.title} at ${i.company} (Industry: ${i.industry || 'Not specified'}, Location: ${i.location}, Skills: ${i.skills.join(', ')})`).join('\n')}

User question: ${chatDto.message}

IMPORTANT RULES:
1. Do NOT apply for any internship unless the user explicitly says "apply for [internship title]"
2. Only recommend and provide information about internships based on the User's Profile (Skills, Major, Interests).
3. If the user seems interested, tell them: "To apply, just say 'Apply for [internship title]'"
4. Keep response concise (3-4 sentences)

Analyze the industries and match them to the student's major (${student.major}) and skills. Recommend 2-3 most relevant internships based on profile alignment.`;
      } else {
        // ========================================================
        // HANDLE GENERAL CONVERSATION
        // ========================================================
        prompt = `You are a helpful internship career assistant for ${student.fullName}, a ${student.major} student.

${studentProfileContext}

Conversation context:
${chatDto.context || 'No previous context'}

User message: ${chatDto.message}

IMPORTANT RULES:
1. Do NOT apply for any internship or take any actions unless explicitly asked
2. Do NOT interpret casual responses like "yes", "ok", "sure" as application requests
3. If the user wants to apply, they need to say "Apply for [internship title]"
4. Respond naturally to greetings and general questions.
5. If the user asks about their profile, referring to the "Student Profile" provided above.

Respond naturally and concisely in 1-2 short sentences. If the user is just greeting or making small talk, respond briefly.`;
      }

      const responseText = await this.generateAIResponse(prompt);

      return {
        response: responseText,
      };
    } catch (error) {
      console.error('Error in AI chat:', error);
      throw error;
    }
  }


  /**
   * Analyze CV and extract structured data
   */
  async analyzeCV(analyzeCVDto: AnalyzeCVDto) {
    try {
      const student = await this.getStudentProfile(analyzeCVDto.studentId);

      if (!student.cvUrl) {
        throw new Error('No CV uploaded. Please upload your CV first.');
      }

      const firestore = this.firebaseService.firestore;

      const prompt = `Analyze this CV/Resume and extract information in the following JSON format:
{
  "skills": ["skill1", "skill2", "skill3"],
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "duration": "Start - End",
      "description": "Brief description"
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "institution": "School/University",
      "year": "Graduation Year"
    }
  ],
  "interests": ["interest1", "interest2"],
  "achievements": ["achievement1", "achievement2"]
}

Note: The CV is available at: ${student.cvUrl}

Please analyze the student's profile and extract the structured information. If you cannot access the CV URL directly, provide a general structure based on the student's major: ${student.major}`;

      const responseText = await this.generateAIResponse(prompt);

      let parsedData;
      try {
        // Extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        } else {
          // Fallback structure
          parsedData = {
            skills: [],
            experience: [],
            education: [],
            interests: [],
            achievements: []
          };
        }
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        parsedData = {
          skills: [],
          experience: [],
          education: [],
          interests: [],
          achievements: []
        };
      }

      // Update student document with parsed data
      await firestore.collection('students').doc(analyzeCVDto.studentId).update({
        cvParsedData: parsedData,
        cvLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        message: 'CV analyzed successfully',
        parsedData,
        cvUrl: student.cvUrl
      };
    } catch (error) {
      console.error('Error analyzing CV:', error);
      throw error;
    }
  }

  /**
   * Internship-specific AI assistant
   */
  async internshipAssistant(internshipAssistantDto: InternshipAssistantDto) {
    try {
      const student = await this.getStudentProfile(internshipAssistantDto.studentId);
      const firestore = this.firebaseService.firestore;

      // Fetch internship details
      const internshipDoc = await firestore
        .collection('internships')
        .doc(internshipAssistantDto.internshipId)
        .get();

      if (!internshipDoc.exists) {
        throw new Error('Internship not found');
      }

      const internship = internshipDoc.data();

      // Fetch company details
      let companyData: any = null;
      if (internship?.companyId) {
        const companyDoc = await firestore
          .collection('companies')
          .doc(internship.companyId)
          .get();

        if (companyDoc.exists) {
          companyData = companyDoc.data();
        }
      }

      const context = await this.buildContext(student);

      const prompt = `Student Context:
${context}

Internship Details:
Title: ${internship?.title}
Company: ${companyData?.name || 'Unknown'}
Description: ${internship?.description}
Location: ${internship?.location}
Duration: ${internship?.duration}
Required Skills: ${internship?.requiredSkills?.join(', ') || 'None listed'}

User Question: ${internshipAssistantDto.question}

Provide detailed, helpful information about this internship opportunity, considering the student's profile and background.`;

      const responseText = await this.generateAIResponse(prompt);

      return {
        response: responseText,
        internship: {
          id: internshipDoc.id,
          ...internship,
        },
        company: companyData,
      };
    } catch (error) {
      console.error('Error in internship assistant:', error);
      throw error;
    }
  }

  /**
   * Clear chat history for a student
   */
  async clearChatHistory(studentId: string) {
    try {
      const firestore = this.firebaseService.firestore;

      // Delete all chat messages for this student
      const chatSnapshot = await firestore
        .collection('ai_chats')
        .where('studentId', '==', studentId)
        .get();

      const batch = firestore.batch();
      chatSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      return {
        success: true,
        message: 'Chat history cleared successfully',
      };
    } catch (error) {
      console.error('Error clearing chat history:', error);
      throw new Error('Failed to clear chat history');
    }
  }

  /**
   * Check if two locations match (same city or area)
   */
  private isLocationMatch(studentAddress: string, internshipLocation: string): boolean {
    if (!studentAddress || !internshipLocation) return false;

    const studentLower = studentAddress.toLowerCase();
    const internshipLower = internshipLocation.toLowerCase();

    // Extract city names (simple approach)
    const studentParts = studentLower.split(/[,\s]+/);
    const internshipParts = internshipLower.split(/[,\s]+/);

    // Check if any significant parts match
    for (const studentPart of studentParts) {
      if (studentPart.length > 3) { // Ignore small words like "in", "on", etc.
        for (const internshipPart of internshipParts) {
          if (internshipPart.includes(studentPart) || studentPart.includes(internshipPart)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if industry matches student's major
   */
  private isMajorMatch(major: string, industry: string): boolean {
    if (!major || !industry) return false;

    const majorLower = major.toLowerCase();
    const industryLower = industry.toLowerCase();

    // Define major-industry mappings
    const majorIndustryMap: { [key: string]: string[] } = {
      'computer science': ['technology', 'software', 'it', 'tech', 'ai', 'data', 'cybersecurity'],
      'engineering': ['engineering', 'manufacturing', 'construction', 'automotive'],
      'business': ['business', 'finance', 'consulting', 'management', 'marketing'],
      'finance': ['finance', 'banking', 'investment', 'accounting'],
      'marketing': ['marketing', 'advertising', 'media', 'communications'],
      'design': ['design', 'creative', 'art', 'graphics', 'ui', 'ux'],
      'medicine': ['healthcare', 'medical', 'pharmaceutical', 'health'],
      'law': ['legal', 'law', 'compliance'],
    };

    // Check direct match
    if (industryLower.includes(majorLower) || majorLower.includes(industryLower)) {
      return true;
    }

    // Check mapped industries
    for (const [key, industries] of Object.entries(majorIndustryMap)) {
      if (majorLower.includes(key)) {
        return industries.some(ind => industryLower.includes(ind));
      }
    }

    return false;
  }
}