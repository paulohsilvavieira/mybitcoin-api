export abstract class EmailService {
  abstract sendVerification(params: {
    to: string;
    name: string;
    token: string;
  }): Promise<void>;
}
