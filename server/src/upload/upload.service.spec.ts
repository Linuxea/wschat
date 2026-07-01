import { UploadService } from './upload.service';

// extOf is private but pure (no dependency access); reach via `as any`.
function extOf(svc: UploadService, name: string): string {
  return (svc as any).extOf(name);
}

describe('UploadService.extOf (pure)', () => {
  let svc: UploadService;
  beforeEach(() => {
    // constructor only stores config; extOf never touches it
    svc = new UploadService(null as any);
  });

  it('lowercases the extension', () => {
    expect(extOf(svc, 'photo.JPG')).toBe('.jpg');
    expect(extOf(svc, 'image.PNG')).toBe('.png');
    expect(extOf(svc, 'doc.PDF')).toBe('.pdf');
  });

  it('returns "" for names with no dot', () => {
    expect(extOf(svc, 'noext')).toBe('');
    expect(extOf(svc, 'README')).toBe('');
  });

  it('returns "" for empty string', () => {
    expect(extOf(svc, '')).toBe('');
  });

  it('takes only the last extension for multi-dot names', () => {
    expect(extOf(svc, 'archive.tar.gz')).toBe('.gz');
    expect(extOf(svc, 'a.b.c.txt')).toBe('.txt');
  });

  it('treats a leading-dot file (dot at index 0) as the extension', () => {
    // lastIndexOf('.') === 0, which is >= 0, so slice(0) => whole name lowercased
    expect(extOf(svc, '.gitignore')).toBe('.gitignore');
    expect(extOf(svc, '.env')).toBe('.env');
  });

  it('preserves a single trailing dot as the "extension"', () => {
    expect(extOf(svc, 'trailing.')).toBe('.');
  });

  it('handles names that are only a dot', () => {
    expect(extOf(svc, '.')).toBe('.');
  });
});
