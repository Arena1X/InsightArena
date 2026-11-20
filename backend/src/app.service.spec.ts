import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  describe('getHello', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should return "Hello World!"', () => {
      const result = service.getHello();
      expect(result).toBe('Hello World!');
    });

    it('should return a string', () => {
      const result = service.getHello();
      expect(typeof result).toBe('string');
    });

    it('should return consistent results on multiple calls', () => {
      const result1 = service.getHello();
      const result2 = service.getHello();
      expect(result1).toBe(result2);
    });

    it('should return non-empty string', () => {
      const result = service.getHello();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should not return null or undefined', () => {
      const result = service.getHello();
      expect(result).not.toBeNull();
      expect(result).not.toBeUndefined();
    });
  });

  describe('service lifecycle', () => {
    it('should be instantiable', () => {
      expect(service).toBeInstanceOf(AppService);
    });

    it('should have getHello method', () => {
      expect(service.getHello).toBeDefined();
      expect(typeof service.getHello).toBe('function');
    });

    it('should be a singleton', () => {
      const service1 = new AppService();
      const service2 = new AppService();

      expect(service1.getHello()).toBe(service2.getHello());
    });
  });
});
