import { IsString, IsEnum, IsOptional, IsInt, IsArray, Min, Max, MaxLength } from 'class-validator';
import { MessageType } from '@prisma/client';

export class SendMessageDto {
  @IsString()
  conversationId!: string;

  @IsEnum(MessageType)
  type!: MessageType;

  @IsString()
  @MaxLength(20000)
  content!: string;

  @IsString()
  @MaxLength(64)
  clientMsgId!: string;

  @IsOptional()
  @IsString()
  replyToId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[]; //被 @ 的成员 userId 列表
}

export class SearchMessagesDto {
  @IsString()
  q!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

export class HistoryQuery {
  @IsOptional()
  @IsInt()
  beforeSeq?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
