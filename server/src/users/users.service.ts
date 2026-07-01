import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateUserDto } from './dto';

export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  nickname: true,
  avatar: true,
  bio: true,
} satisfies Prisma.UserSelect;

export type PublicUser = {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  bio: string | null;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  me(userId: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });
  }

  async update(userId: string, dto: UpdateUserDto): Promise<PublicUser> {
    const data: Prisma.UserUpdateInput = {};
    if (dto.nickname !== undefined) data.nickname = dto.nickname;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.avatar !== undefined) data.avatar = dto.avatar;
    return this.prisma.user.update({ where: { id: userId }, data, select: PUBLIC_USER_SELECT });
  }

  findOne(id: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({ where: { id }, select: PUBLIC_USER_SELECT });
  }

  search(q: string, excludeUserId?: string): Promise<PublicUser[]> {
    return this.prisma.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: PUBLIC_USER_SELECT,
      take: 20,
    });
  }
}
