#!/usr/bin/env node
// MCP server that lets an AI agent keep track of my job applications.
// Data is stored in one JSON file on my computer.
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Where the data lives. Can be changed with an environment variable.
const DATA_FILE = process.env.JOB_TRACKER_FILE || join(homedir(), '.job-applications.json');

const STATUSES = ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'];

// ---------- Reading and saving the file ----------

async function load() {
  try {
    return JSON.parse(await readFile(DATA_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return []; // first run: no file yet
    throw err;
  }
}

async function save(applications) {
  await writeFile(DATA_FILE, JSON.stringify(applications, null, 2));
}

const today = () => new Date().toISOString().slice(0, 10); // e.g. 2026-09-22

// Days between a date and today, so the agent never has to do date maths.
const daysSince = (date) => Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);

const reply = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });

// ---------- The server and its tools ----------

const server = new McpServer({ name: 'job-tracker', version: '1.0.0' });

server.registerTool(
  'add_application',
  {
    title: 'Add a job application',
    description:
      'Record a job the user has applied to or wants to apply to. ' +
      'If the user pastes a job posting, extract the company, role and location from it. ' +
      'Call list_applications first to avoid adding the same job twice.',
    inputSchema: {
      company: z.string().describe('Company name'),
      role: z.string().describe('Job title'),
      location: z.string().optional().describe('City, or "Remote"'),
      url: z.string().optional().describe('Link to the posting'),
      status: z.enum(STATUSES).optional().describe('Defaults to "applied"'),
      notes: z.string().optional().describe('Anything worth remembering, e.g. salary range or contact name'),
    },
  },
  async (input) => {
    const applications = await load();
    const application = {
      id: applications.reduce((max, a) => Math.max(max, a.id), 0) + 1,
      company: input.company,
      role: input.role,
      location: input.location ?? '',
      url: input.url ?? '',
      status: input.status ?? 'applied',
      notes: input.notes ?? '',
      dateAdded: today(),
      lastUpdated: today(),
    };
    applications.push(application);
    await save(applications);
    return reply({ added: application });
  },
);

server.registerTool(
  'list_applications',
  {
    title: 'List job applications',
    description:
      'Show saved job applications, newest first. Each one includes daysSinceUpdate, ' +
      'so you can answer questions like "which applications have had no reply for two weeks?". ' +
      'Optionally filter by status or by company name.',
    inputSchema: {
      status: z.enum(STATUSES).optional(),
      company: z.string().optional().describe('Part of a company name, case-insensitive'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ status, company }) => {
    let applications = await load();
    if (status) applications = applications.filter((a) => a.status === status);
    if (company) {
      applications = applications.filter((a) => a.company.toLowerCase().includes(company.toLowerCase()));
    }
    const result = applications
      .map((a) => ({ ...a, daysSinceUpdate: daysSince(a.lastUpdated) }))
      .sort((a, b) => b.id - a.id);
    return reply({ count: result.length, applications: result });
  },
);

server.registerTool(
  'update_application',
  {
    title: 'Update a job application',
    description:
      'Change the status of an application or add a note, e.g. when the user gets an interview ' +
      'or a rejection. Can also correct the company, role, location or link. ' +
      'Use the id from list_applications. New notes are added to existing ones.',
    inputSchema: {
      id: z.number().int().describe('The application id'),
      status: z.enum(STATUSES).optional(),
      note: z.string().optional().describe('Added to the existing notes with today\'s date'),
      company: z.string().optional().describe('New company name'),
      role: z.string().optional().describe('New job title'),
      location: z.string().optional().describe('New location: city, or "Remote"'),
      url: z.string().optional().describe('New link to the posting; an empty string clears it'),
    },
  },
  async ({ id, status, note, company, role, location, url }) => {
    const applications = await load();
    const application = applications.find((a) => a.id === id);
    if (!application) {
      return fail(`No application with id ${id}. Call list_applications to see valid ids.`);
    }
    if (status) application.status = status;
    if (company) application.company = company;
    if (role) application.role = role;
    if (location !== undefined) application.location = location;
    if (url !== undefined) application.url = url;
    if (note) application.notes = [application.notes, `[${today()}] ${note}`].filter(Boolean).join('\n');
    application.lastUpdated = today();
    await save(applications);
    return reply({ updated: application });
  },
);

await server.connect(new StdioServerTransport());
