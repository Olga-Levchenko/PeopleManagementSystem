import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  search(name?: string) {
    return this.prisma.department.findMany({
      where: name
        ? { name: { contains: name, mode: 'insensitive' } }
        : undefined,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }
}
