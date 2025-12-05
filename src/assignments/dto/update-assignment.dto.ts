export class UpdateAssignmentDto {
  title?: string;
  description?: string;
  dueDate?: string;
  status?: 'assigned' | 'submitted' | 'reviewed';
  submissionUrl?: string;
  submissionNotes?: string;
  reviewNotes?: string;
  score?: number;
}
