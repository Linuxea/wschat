import { IsInt, Min } from 'class-validator';

export class ReadDto {
  @IsInt()
  @Min(0)
  seq!: number;
}
