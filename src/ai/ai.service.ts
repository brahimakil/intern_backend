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
      const context = (chatDto.context || '').toLowerCase();

      // ========================================================
      // STEP 1: Detect if this is a confirmation of pending apply
      // ========================================================
      // Check if AI previously asked "Would you like me to apply for [internship]?"
      const pendingApplyMatch = context.match(/would you like me to apply for (?:the )?["']?(.+?)["']?\??/i);
      const isPendingConfirmation = pendingApplyMatch &&
        (message === 'yes' || message === 'yes please' || message === 'yes, apply' ||
          message === 'confirm' || message === 'yes, confirm' || message === 'sure' ||
          message === 'ok' || message === 'okay' || message === 'go ahead');

      // ========================================================
      // STEP 2: Detect explicit application request
      // ========================================================
      // Must explicitly say "apply for X" or "enroll in X"
      const explicitApplyPattern = /(?:apply|enroll|submit|sign up|register)\s+(?:for|to|in)\s+(?:the\s+)?["']?(.+?)["']?\s*(?:internship|position|job|opportunity)?$/i;
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
        // Fetch all open internships to match against
        const internshipsSnapshot = await firestore
          .collection('internships')
          .where('status', '==', 'open')
          .get();

        let targetInternship: any = null;

        // Fetch companies to provide better context for matching
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

        // Prepare candidates list
        const candidates = internshipsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title,
            company: companyMap.get(data.companyId) || 'Unknown Company',
            originalData: data
          };
        });

        // Use AI to intelligently match the request
        const matchPrompt = `
User Input: "${chatDto.message}"
Conversation Context: "${context.substring(context.length - 800)}" 

Task: Identify the exact internship the user wants to apply for from the list below.
Available Internships:
${candidates.map(c => `- ID: ${c.id} | Title: ${c.title} | Company: ${c.company}`).join('\n')}

Instructions:
1. Analyze the User Input and Context to find the matching internship.
2. If the user mentions a specific company (e.g. "at Google"), strictly match the Company field.
3. If the user just says "yes" or "confirm", look at the Context to see what they are confirming.
4. If the user refers to the "first one", "second one", "number 1", etc., LOOK AT THE CONVERSATION CONTEXT to find the numbered list of recommendations. Match the ordinal number to the internship title/company in the list.
5. If no single clear match is found, return "NONE".
6. Return ONLY the ID string of the matching internship. Do not write sentences.`;

        const matchResult = await this.generateAIResponse(matchPrompt);
        const matchedId = matchResult.replace(/[^a-zA-Z0-9]/g, '').trim(); // Clean up ID
        
        const found = candidates.find(c => c.id === matchedId || matchedId.includes(c.id));
        
        if (found) {
           targetInternship = { id: found.id, ...found.originalData };
        }

        if (!targetInternship) {
          return {
            response: "I couldn't identify which internship you want to apply for. Please specify the exact internship title, for example: \"Apply for Software Developer Intern\".",
          };
        }

        // ========================================================
        // EARLY DUPLICATE CHECK - Always check before any action
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

        // If this was an explicit request (not a confirmation), ask for confirmation first
        if (hasExplicitRequest && !isPendingConfirmation) {
          return {
            response: `Would you like me to apply for "${targetInternship.title}"? Reply "yes" to confirm.`,
          };
        }

        // User confirmed - proceed with application
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
            response: `Great! I've successfully submitted your application for "${targetInternship.title}". You can check your application status in the "My Internships" section. Good luck!`,
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
