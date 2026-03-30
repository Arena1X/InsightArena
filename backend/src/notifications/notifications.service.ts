import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
  ) {}

  async create(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<Notification> {
    const notification = this.notificationsRepository.create({
      user_id: userId,
      type,
      title,
      message,
      metadata: metadata ?? undefined,
    });
    return this.notificationsRepository.save(notification);
  }

  async findAllForUser(
    userId: string,
    page = 1,
    limit = 20,
    unreadOnly = false,
  ): Promise<{
    data: Notification[];
    total: number;
    page: number;
    limit: number;
  }> {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const [data, total] = await this.notificationsRepository.findAndCount({
      where: unreadOnly
        ? { user_id: userId, is_read: false }
        : { user_id: userId },
      order: { created_at: 'DESC' },
      skip,
      take,
    });

    return { data, total, page, limit: take };
  }

  async markAsRead(id: string, userId: string): Promise<void> {
    await this.notificationsRepository.update(
      { id, user_id: userId },
      { is_read: true },
    );
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationsRepository.update(
      { user_id: userId, is_read: false },
      { is_read: true },
    );

    return { updated: result.affected ?? 0 };
  }

  async remove(id: string, userId: string): Promise<void> {
    const notification = await this.notificationsRepository.findOne({
      where: { id, user_id: userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.notificationsRepository.softDelete(id);
  }
}
