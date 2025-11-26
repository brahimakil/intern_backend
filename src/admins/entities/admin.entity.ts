export class Admin {
  id: string;
  email: string;
  fullName: string;
  status: 'active' | 'inactive';
  role: 'admin';
  createdAt: Date;
  updatedAt: Date;
}
