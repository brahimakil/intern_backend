export class CreateAssignmentDto {
  internshipId: string;
  studentId: string;
  companyId: string;
  title: string;
  description: string;
  dueDate: string;
  status?: 'assigned' | 'submitted' | 'reviewed';
}
