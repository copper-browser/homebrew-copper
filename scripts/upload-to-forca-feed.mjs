#!/usr/bin/env node

// Publish artifacts to the internal Forca update-feed app (forca.apps.exowatt.com).
// Ported verbatim from Exowatt-Labs/phi scripts/upload-to-forca-feed.mjs; the
// protocol is product-agnostic (this tap publishes product `copper`).
//
// Legacy upload:
//   FORCA_FEED_UPLOAD_TOKEN=... node scripts/upload-to-forca-feed.mjs \
//     --target downloads file [file...]
//
// Candidate upload:
//   ... --target downloads --product copper --release-id <id> \
//     --version <version> --commit <sha> --status candidate \
//     --alias candidate-name=phi-name file [file...]
//
// LKG promotion (does not upload or rebuild bytes):
//   ... --promote-lkg --product copper --release-id <id> --tag <tag> \
//     --mapping downloads:downloads
//
// Protocol (authoritative behavior: forca-updates release feed):
//   1. DELETE /api/upload/{target}/staging — clean slate
//   2. PUT /api/upload/{target}/{name}?offset=N&total=M — sequential raw chunks
//      (a 409 reports the offset the server has, so interrupted uploads resume)
//   3. POST /api/upload/{target}/finalize — files plus optional release metadata
//   4. POST /api/releases/{product}/{release_id}/promote-lkg — promote archived bytes
import { createHash } from "node:crypto";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CHUNK_BYTES = 16 * 1024 * 1024; // Stay below the feed's 32 MiB edge limit.
const VALID_TARGETS = new Set(["updates-stable", "updates-rc", "downloads"]);
const VALID_STATUSES = new Set(["candidate", "lkg"]);
const MAX_ATTEMPTS = 4;
const DEFAULT_BASE_URL = "https://forca.apps.exowatt.com";

function requireOptionValue(argv, index, option) {
	const value = argv[index + 1];
	if (value == null || value === "" || value.startsWith("--")) {
		throw new Error(`${option} requires a value`);
	}
	return value;
}

function parseAlias(value) {
	const separator = value.indexOf("=");
	if (separator <= 0 || separator === value.length - 1) {
		throw new Error(`--alias must be source=destination, got "${value}"`);
	}
	return { source: value.slice(0, separator), target: value.slice(separator + 1) };
}

function parseMapping(value) {
	const separator = value.indexOf(":");
	if (separator <= 0 || separator === value.length - 1) {
		throw new Error(`--mapping must be source:target, got "${value}"`);
	}
	const source = value.slice(0, separator);
	const target = value.slice(separator + 1);
	if (!VALID_TARGETS.has(source) || !VALID_TARGETS.has(target)) {
		throw new Error(`--mapping targets must be one of: ${[...VALID_TARGETS].join(", ")}, got "${value}"`);
	}
	return { source, target };
}

function optionName(field) {
	return `--${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function aliasObject(aliases) {
	const result = {};
	for (const { source, target } of aliases) {
		if (source in result) throw new Error(`Duplicate alias source: ${source}`);
		result[source] = target;
	}
	return result;
}

/**
 * Parse legacy, candidate, and promotion modes without reading files or using
 * credentials. The returned shapes deliberately match the shared Forca CLI.
 */
export function parseArgs(argv = process.argv) {
	const files = [];
	const aliases = [];
	const mappings = [];
	let target = null;
	let baseUrl = DEFAULT_BASE_URL;
	let promoteLkg = false;
	const metadata = {
		product: null,
		releaseId: null,
		version: null,
		commit: null,
		status: null,
		tag: null,
		publishedAt: null,
	};

	for (let index = 2; index < argv.length; index += 1) {
		const argument = argv[index];
		switch (argument) {
			case "--target":
				target = requireOptionValue(argv, index, argument);
				index += 1;
				break;
			case "--base-url":
				baseUrl = requireOptionValue(argv, index, argument);
				index += 1;
				break;
			case "--product":
				metadata.product = requireOptionValue(argv, index, argument);
				index += 1;
				break;
			case "--release-id":
				metadata.releaseId = requireOptionValue(argv, index, argument);
				index += 1;
				break;
			case "--version":
				metadata.version = requireOptionValue(argv, index, argument);
				index += 1;
				break;
			case "--commit":
				metadata.commit = requireOptionValue(argv, index, argument);
				index += 1;
				break;
			case "--status":
				metadata.status = requireOptionValue(argv, index, argument);
				index += 1;
				break;
			case "--tag":
				metadata.tag = requireOptionValue(argv, index, argument);
				index += 1;
				break;
			case "--published-at":
				metadata.publishedAt = requireOptionValue(argv, index, argument);
				index += 1;
				break;
			case "--alias":
				aliases.push(parseAlias(requireOptionValue(argv, index, argument)));
				index += 1;
				break;
			case "--mapping":
				mappings.push(parseMapping(requireOptionValue(argv, index, argument)));
				index += 1;
				break;
			case "--promote-lkg":
				promoteLkg = true;
				break;
			default:
				if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}`);
				files.push(argument);
		}
	}

	const metadataRequested = aliases.length > 0 || Object.values(metadata).some((value) => value !== null);

	if (promoteLkg) {
		if (target !== null) throw new Error("--target cannot be used with --promote-lkg");
		if (files.length > 0) throw new Error("Files cannot be used with --promote-lkg; promotion uses archived bytes");
		if (!metadata.product || !metadata.releaseId || !metadata.tag) {
			throw new Error("--promote-lkg requires --product, --release-id, and --tag");
		}
		if (metadataRequested && (metadata.version || metadata.commit || metadata.status || metadata.publishedAt)) {
			throw new Error("--version, --commit, --status, and --published-at cannot be used with --promote-lkg");
		}
		if (mappings.length === 0) throw new Error("--promote-lkg requires at least one --mapping");
		return {
			mode: "promote-lkg",
			baseUrl: baseUrl.replace(/\/+$/, ""),
			product: metadata.product,
			releaseId: metadata.releaseId,
			tag: metadata.tag,
			aliases,
			mappings,
		};
	}

	if (!VALID_TARGETS.has(target)) {
		throw new Error(`--target must be one of: ${[...VALID_TARGETS].join(", ")}`);
	}
	if (files.length === 0) throw new Error("No files given");
	if (metadataRequested) {
		const missing = ["product", "releaseId", "version", "commit", "status"].filter((field) => !metadata[field]);
		if (missing.length > 0) throw new Error(`Metadata upload requires: ${missing.map(optionName).join(", ")}`);
		if (!VALID_STATUSES.has(metadata.status)) {
			throw new Error(`--status must be one of: ${[...VALID_STATUSES].join(", ")}`);
		}
	}

	return {
		mode: "upload",
		baseUrl: baseUrl.replace(/\/+$/, ""),
		target,
		files,
		aliases,
		metadata: metadataRequested
			? {
					product: metadata.product,
					release_id: metadata.releaseId,
					version: metadata.version,
					commit: metadata.commit,
					status: metadata.status,
					...(metadata.tag ? { tag: metadata.tag } : {}),
					...(metadata.publishedAt ? { published_at: metadata.publishedAt } : {}),
					...(aliases.length > 0 ? { aliases: aliasObject(aliases) } : {}),
				}
			: null,
	};
}

/** Build the exact finalize request body, including only opt-in metadata. */
export function buildFinalizePayload(files, metadata = null) {
	if (!metadata) return { files };
	return { ...metadata, files };
}

/** Build the exact explicit LKG promotion request body. */
export function buildPromotionPayload({ tag, mappings, aliases = [] }) {
	const aliasMap = aliasObject(aliases);
	const aliasIndex = mappings.findIndex(({ source }) => source === "downloads");
	const indexForAliases = aliasIndex === -1 ? 0 : aliasIndex;
	return {
		tag,
		mappings: mappings.map(({ source, target }, index) => ({
			source_target: source,
			destination_target: target,
			...(Object.keys(aliasMap).length > 0 && index === indexForAliases ? { aliases: aliasMap } : {}),
		})),
	};
}

/** Return the immutable archive root used by candidate run summaries. */
export function archiveBaseUrl(baseUrl, product, releaseId) {
	return `${baseUrl.replace(/\/+$/, "")}/archive/${encodeURIComponent(product)}/${releaseId}`;
}

function redactSecret(value, token) {
	const message = String(value);
	return token ? message.split(token).join("[redacted]") : message;
}

async function responseError(response, token) {
	return redactSecret(`${response.status} ${await response.text()}`, token);
}

async function request(method, url, token, { body, contentType, acceptConflict = true } = {}) {
	let lastError;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		try {
			const headers = { "x-upload-token": token };
			if (body !== undefined) headers["content-type"] = contentType ?? "application/octet-stream";
			const init = { method, headers };
			if (body !== undefined) init.body = body;
			const response = await fetch(url, init);
			if (response.ok || (acceptConflict && response.status === 409)) return response;
			if (response.status >= 500) {
				lastError = new Error(`${method} ${url} -> ${await responseError(response, token)}`);
			} else {
				throw new Error(`${method} ${url} -> ${await responseError(response, token)}`);
			}
		} catch (error) {
			if (error instanceof Error && /-> \d{3} /.test(error.message)) {
				const status = Number(error.message.match(/-> (\d{3}) /)?.[1]);
				if (status >= 400 && status < 500) throw error;
			}
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
	}
	throw lastError;
}

export function sha256File(filePath) {
	const hash = createHash("sha256");
	const fd = openSync(filePath, "r");
	try {
		const buffer = Buffer.alloc(8 * 1024 * 1024);
		let bytes;
		while ((bytes = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
	} finally {
		closeSync(fd);
	}
	return hash.digest("hex");
}

async function uploadFile(filePath, { baseUrl, target, token }) {
	const name = path.basename(filePath);
	const total = statSync(filePath).size;
	const fd = openSync(filePath, "r");
	try {
		let offset = 0;
		while (offset < total) {
			const size = Math.min(CHUNK_BYTES, total - offset);
			const buffer = Buffer.alloc(size);
			readSync(fd, buffer, 0, size, offset);
			const url = `${baseUrl}/api/upload/${target}/${encodeURIComponent(name)}?offset=${offset}&total=${total}`;
			const response = await request("PUT", url, token, { body: buffer });
			if (response.status === 409) {
				const detail = await response.json().catch(() => ({}));
				const expected = Number(String(detail.detail ?? "").match(/\d+/)?.[0]);
				if (!Number.isFinite(expected)) throw new Error(`Unparseable 409: ${redactSecret(JSON.stringify(detail), token)}`);
				offset = expected;
				continue;
			}
			const body = await response.json();
			offset = body.received;
			process.stdout.write(`\r${name}: ${offset}/${total} bytes`);
		}
		process.stdout.write("\n");
	} finally {
		closeSync(fd);
	}
	return { name, sha256: sha256File(filePath) };
}

async function uploadAndFinalize(args, token) {
	console.log(`Publishing ${args.files.length} file(s) to ${args.baseUrl} target=${args.target}`);
	await request("DELETE", `${args.baseUrl}/api/upload/${args.target}/staging`, token);
	const finalizeFiles = [];
	for (const file of args.files) finalizeFiles.push(await uploadFile(file, { ...args, token }));
	const finalizeResponse = await request("POST", `${args.baseUrl}/api/upload/${args.target}/finalize`, token, {
		body: JSON.stringify(buildFinalizePayload(finalizeFiles, args.metadata)),
		contentType: "application/json",
		acceptConflict: false,
	});
	const result = await finalizeResponse.json();
	console.log(`Promoted: ${redactSecret(JSON.stringify(result.promoted), token)}`);
	return result;
}

async function promoteLkg(args, token) {
	const payload = buildPromotionPayload(args);
	const url = `${args.baseUrl}/api/releases/${encodeURIComponent(args.product)}/${encodeURIComponent(args.releaseId)}/promote-lkg`;
	console.log(`Promoting archived release ${args.releaseId} to LKG`);
	const response = await request("POST", url, token, {
		body: JSON.stringify(payload),
		contentType: "application/json",
		acceptConflict: false,
	});
	const result = await response.json();
	console.log(`Promoted LKG: ${redactSecret(JSON.stringify(result), token)}`);
	return result;
}

export async function run(argv = process.argv, env = process.env) {
	const args = parseArgs(argv);
	const token = env.FORCA_FEED_UPLOAD_TOKEN ?? "";
	if (!token) throw new Error("FORCA_FEED_UPLOAD_TOKEN is not set");
	if (args.mode === "promote-lkg") return promoteLkg(args, token);
	return uploadAndFinalize(args, token);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
	run().catch((error) => {
		console.error(redactSecret(error instanceof Error ? error.message : error, process.env.FORCA_FEED_UPLOAD_TOKEN ?? ""));
		process.exitCode = 1;
	});
}
