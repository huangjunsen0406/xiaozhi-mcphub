import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import AdmZip from 'adm-zip';
import { Request, Response } from 'express';
import { uploadMcpbFile } from '../../src/controllers/mcpbController.js';

describe('mcpbController - uploadMcpbFile', () => {
  let tempRoot: string;
  let cwdSpy: jest.SpiedFunction<typeof process.cwd>;

  const createResponse = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnThis();

    return {
      json,
      status,
      response: {
        json,
        status,
      } as unknown as Response,
    };
  };

  const createMcpbFile = (manifestName: string): string => {
    const uploadDir = path.join(tempRoot, 'data/uploads/mcpb');
    const mcpbFilePath = path.join(uploadDir, 'payload.mcpb');
    const zip = new AdmZip();

    zip.addFile(
      'manifest.json',
      Buffer.from(
        JSON.stringify({
          manifest_version: '1',
          name: manifestName,
          version: '1.0.0',
          server: {
            entry: 'server.js',
          },
        }),
        'utf-8',
      ),
    );
    zip.addFile('server.js', Buffer.from('export default {};', 'utf-8'));
    zip.writeZip(mcpbFilePath);

    return mcpbFilePath;
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpb-controller-'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'data/uploads/mcpb'), { recursive: true });
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('rejects manifest names that attempt path traversal', async () => {
    const mcpbFilePath = createMcpbFile('../../../escaped/server');
    const { response, json, status } = createResponse();
    const request = {
      file: {
        path: mcpbFilePath,
      },
    } as Request;
    const uploadDir = path.join(tempRoot, 'data/uploads/mcpb');
    const escapedDir = path.resolve(uploadDir, 'server-../../../escaped/server');

    await uploadMcpbFile(request, response);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Invalid manifest: name'),
      }),
    );
    expect(fs.existsSync(escapedDir)).toBe(false);
    expect(fs.existsSync(mcpbFilePath)).toBe(false);
    expect(fs.readdirSync(uploadDir).filter((file) => file.startsWith('temp-extracted-'))).toHaveLength(0);
  });

  it('extracts MCPB files into the upload directory when the manifest name is safe', async () => {
    const mcpbFilePath = createMcpbFile('weather-server');
    const { response, json, status } = createResponse();
    const request = {
      file: {
        path: mcpbFilePath,
      },
    } as Request;
    const uploadDir = path.join(tempRoot, 'data/uploads/mcpb');
    const finalExtractDir = path.join(uploadDir, 'server-weather-server');

    await uploadMcpbFile(request, response);

    expect(status).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          manifest: expect.objectContaining({
            name: 'weather-server',
          }),
          extractDir: finalExtractDir,
        }),
      }),
    );
    expect(fs.existsSync(path.join(finalExtractDir, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(finalExtractDir, 'server.js'))).toBe(true);
  });

  it('rejects archive entries that attempt zip-slip path traversal', async () => {
    const uploadDir = path.join(tempRoot, 'data/uploads/mcpb');
    const mcpbFilePath = path.join(uploadDir, 'slip.mcpb');

    // Build a zip whose central-directory names still contain ".."
    // (AdmZip.addFile may collapse them; write raw zip via buffer from a known layout).
    const staging = path.join(tempRoot, 'slip-staging');
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(
      path.join(staging, 'manifest.json'),
      JSON.stringify({
        manifest_version: '1',
        name: 'safe-name',
        version: '1.0.0',
        server: { entry: 'server.js' },
      }),
    );
    // Use Python zipfile to preserve traversal entry names
    execFileSync(
      'python3',
      [
        '-c',
        `
import zipfile
z = zipfile.ZipFile(${JSON.stringify(mcpbFilePath)}, 'w')
z.write(${JSON.stringify(path.join(staging, 'manifest.json'))}, 'manifest.json')
z.writestr('../../../escaped-pwn.txt', 'pwned')
z.writestr('subdir/../../outside.txt', 'out')
z.close()
`,
      ],
      { stdio: 'pipe' },
    );

    const { response, json, status } = createResponse();
    await uploadMcpbFile({ file: { path: mcpbFilePath } } as Request, response);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Invalid archive entry path'),
      }),
    );
    expect(fs.existsSync(path.resolve(uploadDir, '../../../escaped-pwn.txt'))).toBe(false);
    expect(fs.existsSync(mcpbFilePath)).toBe(false);
  });
});
