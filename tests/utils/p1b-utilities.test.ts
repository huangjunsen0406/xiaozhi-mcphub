import {
  applyHiddenParams,
  findToolConfig,
  findToolConfigKey,
  removeHiddenArguments,
  resolveRuntimeToolName,
} from '../../src/utils/toolConfig.js';
import { matchesNamePattern } from '../../src/utils/namePattern.js';
import {
  assertValidGroupToolNames,
  projectGroupToolName,
} from '../../src/utils/groupToolNames.js';
import { compatibleToolNames } from '../../src/utils/compatibleToolNames.js';
import { fromOpenApiSchema, toOpenApiSchema } from '../../src/utils/openApiSchema.js';
import {
  parseFullSchemaTopN,
  parseSimilarityThreshold,
  parseToolDefinitionFields,
} from '../../src/utils/smartRouting.js';

describe('P1-B tool curation, OpenAPI schema, and smart routing utilities', () => {
  describe('toolConfig (#1343)', () => {
    it('hides optional parameters from inputSchema and strips them from call args while keeping required params', () => {
      const tool = {
        name: 'srv-search',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            debug: { type: 'boolean' },
            limit: { type: 'integer' },
          },
          required: ['query'],
        },
      };
      const cfg = { enabled: true, hiddenParams: ['query', 'debug'] };
      const projected = applyHiddenParams(tool, cfg);
      expect(Object.keys((projected.inputSchema as any).properties)).toEqual(['query', 'limit']);

      const sanitized = removeHiddenArguments(
        { query: 'hi', debug: true, limit: 5 },
        tool.inputSchema,
        cfg,
      );
      expect(sanitized).toEqual({ query: 'hi', limit: 5 });
    });

    it('resolves runtime and bare tool config keys without shadowing another tool', () => {
      const runtime = ['fc-scrape', 'fc-fc-scrape'];
      expect(resolveRuntimeToolName('fc', 'scrape', runtime)).toBe('fc-scrape');
      expect(resolveRuntimeToolName('fc', 'fc-scrape', runtime)).toBe('fc-scrape');
      const tools = { scrape: { enabled: false } };
      expect(findToolConfig(tools, 'fc', 'fc-scrape', runtime)).toEqual({ enabled: false });
      expect(findToolConfigKey(tools, 'fc', 'fc-scrape', runtime)).toBe('scrape');
    });
  });

  describe('namePattern (#1372)', () => {
    it('matches * and ? globs case-sensitively', () => {
      expect(matchesNamePattern('github-list_issues', '*-list_*')).toBe(true);
      expect(matchesNamePattern('read_file', 'read_????')).toBe(true);
      expect(matchesNamePattern('read_file', 'READ_*')).toBe(false);
    });
  });

  describe('groupToolNames (#1391)', () => {
    it('preserves bare upstream names when preserveToolNames is true and rejects collisions', () => {
      expect(
        projectGroupToolName('srv-search', 'srv', { name: 'srv', preserveToolNames: true }, '-'),
      ).toBe('search');
      expect(
        projectGroupToolName('srv-search', 'srv', { name: 'srv', alias: 's' }, '-'),
      ).toBe('s-search');
      expect(() => assertValidGroupToolNames([{ name: 'search' }, { name: 'search' }])).toThrow(
        /Ambiguous group tool name/,
      );
      expect(() => assertValidGroupToolNames([{ name: 'search_tools' }])).toThrow(
        /Smart Routing meta-tools/,
      );
    });
  });

  describe('compatibleToolNames (#1498)', () => {
    it('preserves valid OpenAI names and deterministically rewrites invalid/long names', () => {
      const tools = ['users.list', 'users_list', 'a-b', '', '查询', 'a'.repeat(65)].map((name) => ({
        name,
      }));
      const aliases = compatibleToolNames(tools);
      expect(aliases.get('users_list')).toBe('users_list');
      expect(aliases.get('a-b')).toBe('a-b');
      expect(new Set(aliases.values()).size).toBe(tools.length);
      for (const alias of aliases.values()) {
        expect(alias).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      }
      expect(compatibleToolNames([...tools].reverse())).toEqual(aliases);
    });
  });

  describe('openApiSchema (#1447 / #1482)', () => {
    it('converts OpenAPI 3.0 nullable to JSON Schema type arrays and back', () => {
      const jsonSchema = fromOpenApiSchema({
        type: 'object',
        properties: {
          parentId: { type: 'integer', nullable: true },
          tags: { type: 'array', nullable: true, items: { type: 'string', nullable: true } },
        },
      });
      expect(jsonSchema).toEqual({
        type: 'object',
        properties: {
          parentId: { type: ['integer', 'null'] },
          tags: { type: ['array', 'null'], items: { type: ['string', 'null'] } },
        },
      });

      const openapiSchema = toOpenApiSchema({
        type: 'object',
        properties: {
          title: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Optional title' },
        },
      });
      expect(openapiSchema.properties.title).toEqual({
        type: 'string',
        nullable: true,
        description: 'Optional title',
      });
    });
  });

  describe('smartRouting parsers (#1234 / #1286)', () => {
    it('validates similarityThreshold, fullSchemaTopN, and toolDefinitionFields', () => {
      expect(parseSimilarityThreshold(0.35)).toBe(0.35);
      expect(parseSimilarityThreshold('0.5')).toBe(0.5);
      expect(parseSimilarityThreshold(1.5)).toBeUndefined();
      expect(parseFullSchemaTopN(3)).toBe(3);
      expect(parseFullSchemaTopN(0)).toBe(0);
      expect(parseFullSchemaTopN(-1)).toBeUndefined();
      expect(parseToolDefinitionFields('annotations,title')).toEqual(['title', 'annotations']);
      expect(parseToolDefinitionFields('none')).toEqual([]);
      expect(parseToolDefinitionFields(['unknown'])).toBeUndefined();
    });
  });
});
