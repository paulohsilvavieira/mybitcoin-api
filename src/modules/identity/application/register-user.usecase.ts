import { randomBytes } from 'crypto';
import { User } from '../domain/entities/user.entity';
import { Email } from '../domain/value-objects/email.vo';
import { UserRepository } from '../domain/repositories/user.repository';
import { EmailService } from '../domain/services/email.service';
import { EmailAlreadyExistsError } from '../domain/errors/email-already-exists.error';
import { TermsNotAcceptedError } from '../domain/errors/terms-not-accepted.error';

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
  termsAccepted: boolean;
  registrationIp: string;
}

export interface RegisterUserOutput {
  userId: string;
  email: string;
}

export class RegisterUser {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly emailService: EmailService,
    private readonly hashPassword: (plain: string) => Promise<string>,
  ) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    const email = Email.create(input.email);

    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      throw new EmailAlreadyExistsError(input.email);
    }

    if (!input.termsAccepted) {
      throw new TermsNotAcceptedError();
    }

    const passwordHash = await this.hashPassword(input.password);

    const user = User.create({
      name: input.name,
      email,
      passwordHash,
      termsAccepted: input.termsAccepted,
      registrationIp: input.registrationIp,
    });

    await this.userRepo.save(user);

    const verificationToken = randomBytes(32).toString('hex');
    this.emailService
      .sendVerification({
        to: input.email,
        name: input.name,
        token: verificationToken,
      })
      .catch(() => {});

    return {
      userId: user.id.toString(),
      email: user.email.toString(),
    };
  }
}
