import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New chat"),
  mode: text("mode").notNull().default("chat"),
  model: text("model").notNull().default("flash"),
  skillId: text("skill_id"),
  projectId: text("project_id"),
  temporary: integer("temporary", { mode: "boolean" }).notNull().default(false),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  canvas: text("canvas"),
  plan: text("plan"),
  deliverable: text("deliverable"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  instructions: text("instructions").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

export const memory = sqliteTable("memory", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  instructions: text("instructions").notNull(),
  tools: text("tools").notNull(),
  icon: text("icon").notNull().default("sparkles"),
  builtin: integer("builtin", { mode: "boolean" }).notNull().default(false),
});

export const plugins = sqliteTable("plugins", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  manifest: text("manifest").notNull(),
});

export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  transport: text("transport").notNull().default("stdio"),
  command: text("command"),
  args: text("args"),
  url: text("url"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
