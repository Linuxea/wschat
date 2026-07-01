import { IsString } from 'class-validator';

export class StartCallDto {
  @IsString()
  conversationId!: string;
}
