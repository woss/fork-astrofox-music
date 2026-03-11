import { raiseError } from "@/app/actions/error";
import { showModal } from "@/app/actions/modals";
import { loadReactors, resetReactors } from "@/app/actions/reactors";
import {
	loadScenes,
	resetScenes,
	updateElementProperty,
} from "@/app/actions/scenes";
import { updateCanvas, updateStage } from "@/app/actions/stage";
import {
	BLANK_IMAGE,
	DEFAULT_CANVAS_BGCOLOR,
	DEFAULT_CANVAS_HEIGHT,
	DEFAULT_CANVAS_WIDTH,
} from "@/app/constants";
import { api, env, library, logger, reactors, stage } from "@/app/global";
import AudioReactor from "@/lib/audio/AudioReactor";
import Display from "@/lib/core/Display";
import Entity from "@/lib/core/Entity";
import Scene from "@/lib/core/Scene";
import Stage from "@/lib/core/Stage";
import { resetLabelCount } from "@/lib/utils/controls";
import create from "zustand";

export const DEFAULT_PROJECT_NAME = "Untitled Project";

type MediaKind = "image" | "video";

export interface MediaRef {
	displayId: string;
	kind: MediaKind;
	label: string;
	sourcePath: string;
}

interface ProjectState {
	projectId: string | null;
	projectName: string;
	opened: number;
	lastModified: number;
	unresolvedMediaRefs: MediaRef[];
}

interface FileLikeWithPath extends File {
	path?: string;
	filePath?: string;
	fullPath?: string;
}

interface ElementSnapshot extends Record<string, unknown> {
	id: string;
	name?: string;
	displayName?: string;
	properties?: Record<string, unknown>;
}

interface SceneSnapshot extends Record<string, unknown> {
	displays?: ElementSnapshot[];
	effects?: ElementSnapshot[];
}

interface ProjectSnapshot extends Record<string, unknown> {
	stage?: { properties?: Record<string, unknown> };
	scenes?: SceneSnapshot[];
	reactors?: Record<string, unknown>[];
}

interface ProjectFilePayload extends Record<string, unknown> {
	snapshot?: ProjectSnapshot;
	snapshotJson?: ProjectSnapshot;
	project?: {
		snapshot?: ProjectSnapshot;
		snapshotJson?: ProjectSnapshot;
		name?: string;
		mediaRefs?: MediaRef[];
	};
	projectName?: string;
	name?: string;
	mediaRefs?: MediaRef[];
}

type MediaRefInput = Partial<MediaRef> & {
	path?: string;
};

type LibraryConstructor = new (
	properties?: Record<string, unknown>,
) => Entity;

type SceneEntity = {
	id: string;
	scene: unknown;
	toJSON: () => Record<string, unknown>;
};

const PROJECT_FILE_FILTERS = [
	{
		name: "Astrofox project",
		extensions: ["json"],
		mimeType: "application/json",
	},
];

const initialState: ProjectState = {
	projectId: null,
	projectName: DEFAULT_PROJECT_NAME,
	opened: 0,
	lastModified: 0,
	unresolvedMediaRefs: [],
};

const projectStore = create<ProjectState>(() => ({
	...initialState,
}));

function snapshotProject(): ProjectSnapshot {
	return {
		version: env.APP_VERSION,
		stage: stage.toJSON(),
		scenes: stage.scenes.toJSON(),
		reactors: reactors.toJSON(),
	};
}

function isEmbeddedMediaSource(src: string) {
	return /^data:(image|video)\//i.test(src);
}

function isRemoteMediaSource(src: string) {
	return /^(https?:)?\/\//i.test(src);
}

function isBlobMediaSource(src: string) {
	return /^blob:/i.test(src);
}

function isFileUrlSource(src: string) {
	return /^file:\/\//i.test(src);
}

function isWindowsPathSource(src: string) {
	return /^[a-zA-Z]:[\\/]/.test(src);
}

function isUncPathSource(src: string) {
	return /^\\\\/.test(src);
}

function normalizeMediaPath(path: unknown): string {
	if (typeof path !== "string") {
		return "";
	}

	return path.trim();
}

function fileUrlToPath(src: string): string {
	if (!isFileUrlSource(src)) {
		return "";
	}

	try {
		const url = new URL(src);
		let path = decodeURIComponent(url.pathname || "");

		if (/^\/[a-zA-Z]:/.test(path)) {
			path = path.slice(1);
		}

		if (url.host) {
			return `\\\\${url.host}${path.replace(/\//g, "\\")}`;
		}

		if (/^[a-zA-Z]:/.test(path)) {
			return path.replace(/\//g, "\\");
		}

		return path;
	} catch {
		const rawPath = decodeURIComponent(src.replace(/^file:\/\//i, ""));
		return rawPath.replace(/^\/[a-zA-Z]:/, (match) => match.slice(1));
	}
}

function toFileUrl(path: string): string {
	const sourcePath = normalizeMediaPath(path);

	if (!sourcePath) {
		return "";
	}

	if (isFileUrlSource(sourcePath)) {
		return sourcePath;
	}

	const escaped = encodeURI(sourcePath)
		.replace(/#/g, "%23")
		.replace(/\?/g, "%3F");

	if (isWindowsPathSource(sourcePath)) {
		return `file:///${escaped.replace(/\\/g, "/")}`;
	}

	if (isUncPathSource(sourcePath)) {
		const unc = escaped.replace(/^\\\\/, "").replace(/\\/g, "/");
		return `file://${unc}`;
	}

	if (sourcePath.startsWith("/")) {
		return `file://${escaped}`;
	}

	return sourcePath;
}

function getMediaSourcePath(src: unknown): string {
	if (typeof src !== "string") {
		return "";
	}

	if (isFileUrlSource(src)) {
		return normalizeMediaPath(fileUrlToPath(src));
	}

	if (isWindowsPathSource(src) || isUncPathSource(src)) {
		return normalizeMediaPath(src);
	}

	return "";
}

function getFilePath(file: FileLikeWithPath | null | undefined): string {
	if (!file || typeof file !== "object") {
		return "";
	}

	const path =
		normalizeMediaPath(file.path) ||
		normalizeMediaPath(file.filePath) ||
		normalizeMediaPath(file.fullPath);

	return path;
}

function getMediaKind(element: Pick<ElementSnapshot, "name"> | null | undefined): MediaKind {
	return element?.name === "VideoDisplay" ? "video" : "image";
}

function getMediaLabel(
	element: Pick<ElementSnapshot, "displayName" | "name"> | null | undefined,
): string {
	return element?.displayName || element?.name || "Media";
}

function buildMediaRef(
	element: Pick<ElementSnapshot, "id" | "name" | "displayName">,
	sourcePath = "",
): MediaRef {
	return {
		displayId: element.id,
		kind: getMediaKind(element),
		label: getMediaLabel(element),
		sourcePath,
	};
}

function normalizeMediaRef(
	mediaRef: MediaRefInput | null | undefined,
): MediaRef | null {
	if (!mediaRef || typeof mediaRef !== "object" || !mediaRef.displayId) {
		return null;
	}

	return {
		displayId: mediaRef.displayId,
		kind: mediaRef.kind === "video" ? "video" : "image",
		label: mediaRef.label || "Media",
		sourcePath:
			normalizeMediaPath(mediaRef.sourcePath) ||
			normalizeMediaPath(mediaRef.path) ||
			"",
	};
}

function mergeMediaRefs(
	...groups: Array<MediaRefInput[] | null | undefined>
): MediaRef[] {
	const byDisplayId = new Map<string, MediaRef>();

	for (const group of groups) {
		for (const mediaRef of group || []) {
			const normalized = normalizeMediaRef(mediaRef);
			if (!normalized) {
				continue;
			}

			const previous = byDisplayId.get(normalized.displayId);

			byDisplayId.set(normalized.displayId, {
				...(previous || {}),
				...normalized,
				sourcePath: normalized.sourcePath || previous?.sourcePath || "",
			});
		}
	}

	return Array.from(byDisplayId.values());
}

async function canLoadMediaSource(src: string, kind: MediaKind): Promise<boolean> {
	if (!src) {
		return false;
	}

	return new Promise<boolean>((resolve) => {
		let settled = false;

		function done(result: boolean) {
			if (settled) {
				return;
			}

			settled = true;
			resolve(result);
		}

		const timeoutId = window.setTimeout(() => done(false), 2000);

		if (kind === "video") {
			const video = document.createElement("video");
			video.preload = "metadata";

			video.onloadedmetadata = () => {
				window.clearTimeout(timeoutId);
				video.removeAttribute("src");
				video.load();
				done(true);
			};

			video.onerror = () => {
				window.clearTimeout(timeoutId);
				video.removeAttribute("src");
				video.load();
				done(false);
			};

			video.src = src;
			return;
		}

		const image = new Image();

		image.onload = () => {
			window.clearTimeout(timeoutId);
			done(true);
		};

		image.onerror = () => {
			window.clearTimeout(timeoutId);
			done(false);
		};

		image.src = src;
	});
}

function prepareSnapshotMediaForSave(snapshot: ProjectSnapshot) {
	const mediaRefs: MediaRef[] = [];

	const scenes = (snapshot?.scenes || []).map((scene: SceneSnapshot) => {
		const mapMediaProps = (element: ElementSnapshot) => {
			const src = element?.properties?.src;
			const sourcePath = normalizeMediaPath(element?.properties?.sourcePath);

			if (sourcePath) {
				mediaRefs.push(buildMediaRef(element, sourcePath));

				if (!src || src === BLANK_IMAGE || typeof src !== "string") {
					return {
						...element,
						properties: {
							...element.properties,
							sourcePath,
						},
					};
				}

				return {
					...element,
					properties: {
						...element.properties,
						src: toFileUrl(sourcePath),
						sourcePath,
					},
				};
			}

			if (!src || src === BLANK_IMAGE || typeof src !== "string") {
				return element;
			}

			const inferredSourcePath = getMediaSourcePath(src);

			if (inferredSourcePath) {
				mediaRefs.push(buildMediaRef(element, inferredSourcePath));

				return {
					...element,
					properties: {
						...element.properties,
						src: toFileUrl(inferredSourcePath),
						sourcePath: inferredSourcePath,
					},
				};
			}

			if (isBlobMediaSource(src)) {
				mediaRefs.push(buildMediaRef(element));

				return {
					...element,
					properties: {
						...element.properties,
						src: BLANK_IMAGE,
						sourcePath: "",
					},
				};
			}

			if (isEmbeddedMediaSource(src) || isRemoteMediaSource(src)) {
				return element;
			}

			return element;
		};

		return {
			...scene,
			displays: (scene.displays || []).map(mapMediaProps),
			effects: (scene.effects || []).map(mapMediaProps),
		};
	});

	return {
		snapshot: {
			...snapshot,
			scenes,
		},
		mediaRefs,
	};
}

async function resolveSnapshotMediaOnLoad(
	snapshot: ProjectSnapshot,
	payloadMediaRefs: MediaRefInput[] = [],
): Promise<{
	snapshot: ProjectSnapshot;
	unresolvedMediaRefs: MediaRef[];
}> {
	const mediaRefMap = new Map<string, MediaRef>();

	for (const mediaRef of payloadMediaRefs || []) {
		const normalized = normalizeMediaRef(mediaRef);

		if (normalized) {
			mediaRefMap.set(normalized.displayId, normalized);
		}
	}

	const unresolvedMediaRefs: MediaRef[] = [];

	const scenes = await Promise.all(
		(snapshot?.scenes || []).map(async (scene: SceneSnapshot) => {
			const mapMediaProps = async (element: ElementSnapshot) => {
				const src = element?.properties?.src;

				const mediaRef = mediaRefMap.get(element.id);
				const sourcePath =
					normalizeMediaPath(element?.properties?.sourcePath) ||
					normalizeMediaPath(mediaRef?.sourcePath) ||
					getMediaSourcePath(src);

				if (sourcePath) {
					const sourceUrl = toFileUrl(sourcePath);
					const canLoad = await canLoadMediaSource(
						sourceUrl,
						getMediaKind(element),
					);

					if (canLoad) {
						return {
							...element,
							properties: {
								...element.properties,
								src: sourceUrl,
								sourcePath,
							},
						};
					}

					if (
						typeof src === "string" &&
						(isEmbeddedMediaSource(src) || isRemoteMediaSource(src))
					) {
						return {
							...element,
							properties: {
								...element.properties,
								sourcePath: "",
							},
						};
					}

					unresolvedMediaRefs.push(buildMediaRef(element, sourcePath));

					return {
						...element,
						properties: {
							...element.properties,
							src: BLANK_IMAGE,
							sourcePath,
						},
					};
				}

				if (!src || src === BLANK_IMAGE || typeof src !== "string") {
					return element;
				}

				if (isBlobMediaSource(src)) {
					unresolvedMediaRefs.push(buildMediaRef(element));

					return {
						...element,
						properties: {
							...element.properties,
							src: BLANK_IMAGE,
							sourcePath: "",
						},
					};
				}

				return element;
			};

			return {
				...scene,
				displays: await Promise.all((scene.displays || []).map(mapMediaProps)),
				effects: await Promise.all((scene.effects || []).map(mapMediaProps)),
			};
		}),
	);

	return {
		snapshot: {
			...snapshot,
			scenes,
		},
		unresolvedMediaRefs,
	};
}

function setUnresolvedMediaRefs(mediaRefs: MediaRef[] = []) {
	projectStore.setState({
		unresolvedMediaRefs: mediaRefs,
	});
}

function sanitizeFileName(name?: string) {
	return (name || "")
		.trim()
		.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
		.replace(/\s+/g, " ")
		.trim();
}

function createProjectFileName(name?: string) {
	const safeName = sanitizeFileName(name) || DEFAULT_PROJECT_NAME;
	return `${safeName}.json`;
}

function parseProjectNameFromFile(fileName = "") {
	return fileName.replace(/\.json$/i, "").trim() || DEFAULT_PROJECT_NAME;
}

function parseProjectPayload(payload: unknown, fallbackName?: string) {
	if (!payload || typeof payload !== "object") {
		throw new Error("Invalid project file.");
	}

	const data = payload as ProjectFilePayload;

	const snapshot =
		data.snapshot ||
		data.snapshotJson ||
		data.project?.snapshot ||
		data.project?.snapshotJson ||
		data;

	if (!snapshot || typeof snapshot !== "object") {
		throw new Error("Invalid project snapshot.");
	}

	return {
		snapshot,
		projectName:
			data.projectName ||
			data.name ||
			data.project?.name ||
			fallbackName ||
			DEFAULT_PROJECT_NAME,
		mediaRefs: data.mediaRefs || data.project?.mediaRefs || [],
	};
}

async function loadProjectFromPayload(payload: unknown, fallbackName?: string) {
	const { snapshot, projectName, mediaRefs } = parseProjectPayload(
		payload,
		fallbackName,
	);
	const {
		snapshot: resolvedSnapshot,
		unresolvedMediaRefs: detectedMissingMedia,
	} = await resolveSnapshotMediaOnLoad(snapshot, mediaRefs);
	const unresolvedMediaRefs = mergeMediaRefs(detectedMissingMedia);

	loadProject(resolvedSnapshot);
	await loadScenes();
	loadReactors();

	projectStore.setState({
		projectId: null,
		projectName: projectName || DEFAULT_PROJECT_NAME,
		opened: Date.now(),
		lastModified: 0,
		unresolvedMediaRefs: unresolvedMediaRefs,
	});

	if (unresolvedMediaRefs.length > 0) {
		const count = unresolvedMediaRefs.length;
		openRelinkMediaDialog({
			title: `${count} media file${count === 1 ? "" : "s"} missing`,
		});
	}
}

export function touchProject() {
	projectStore.setState({ lastModified: Date.now() });
}

export function updateProjectName(name: string) {
	const nextName = name.trim() || DEFAULT_PROJECT_NAME;
	const { projectName } = projectStore.getState();

	if (nextName === projectName) {
		return;
	}

	projectStore.setState({
		projectName: nextName,
		lastModified: Date.now(),
	});
}

export function resetProject() {
	projectStore.setState({ ...initialState });
}

export function loadProject(data: ProjectSnapshot) {
	logger.log("Loaded project:", data);

	const displays = library.get("displays") as Record<string, LibraryConstructor>;
	const effects = library.get("effects") as Record<string, LibraryConstructor>;

	const loadElement = (
		scene: Scene,
		config: Record<string, unknown> & { name?: string },
	) => {
		const { name = "" } = config;
		const module = displays[name] || effects[name];

		if (module) {
			const entity = Display.create(module, config);
			scene.addElement(entity as unknown as SceneEntity);
		} else {
			logger.warn("Component not found:", name);
		}
	};

	resetScenes(false);
	resetReactors();
	resetLabelCount();

	if (data.stage) {
		updateStage(data.stage.properties || {});
	} else {
		updateStage(Stage.defaultProperties);
	}

	if (data.reactors) {
		for (const config of data.reactors) {
			const reactor = Entity.create(AudioReactor, config);
			reactors.addReactor(reactor as unknown);
		}
	}

	if (data.scenes) {
		for (const config of data.scenes) {
			const scene = Display.create(Scene, config) as Scene;

			stage.addScene(scene);

			if (config.displays) {
				for (const display of config.displays) {
					loadElement(scene, display);
				}
			}

			if (config.effects) {
				for (const effect of config.effects) {
					loadElement(scene, effect);
				}
			}
		}
	}
}

export async function newProject() {
	resetLabelCount();
	await resetScenes();
	await resetReactors();
	await updateCanvas(
		DEFAULT_CANVAS_WIDTH,
		DEFAULT_CANVAS_HEIGHT,
		DEFAULT_CANVAS_BGCOLOR,
	);

	const scene = stage.addScene() as Scene;
	const displays = library.get("displays") as Record<string, LibraryConstructor>;

	scene.addElement(new displays.ImageDisplay() as unknown as SceneEntity);
	scene.addElement(new displays.BarSpectrumDisplay() as unknown as SceneEntity);
	scene.addElement(new displays.TextDisplay() as unknown as SceneEntity);

	await loadScenes();
	await loadReactors();

	projectStore.setState({
		projectId: null,
		projectName: DEFAULT_PROJECT_NAME,
		opened: Date.now(),
		lastModified: 0,
		unresolvedMediaRefs: [],
	});
}

export function checkUnsavedChanges(
	menuAction: string,
	action: () => unknown,
) {
	const { opened, lastModified } = projectStore.getState();

	if (lastModified > opened) {
		showModal(
			"UnsavedChangesDialog",
			{ showCloseButton: false },
			{ action: menuAction },
		);
	} else {
		action();
	}
}

export async function openProjectFile() {
	try {
		const { files, canceled } = await api.showOpenDialog({
			filters: PROJECT_FILE_FILTERS,
		});

		if (canceled || !files || !files.length) {
			return false;
		}

		const file = files[0];
		if (!/\.json$/i.test(file.name || "")) {
			throw new Error("Project file must use the .json extension.");
		}
		const text = await file.text();
		const payload = JSON.parse(text);
		const fallbackName = parseProjectNameFromFile(file.name);

		await loadProjectFromPayload(payload, fallbackName);
		return true;
	} catch (error) {
		raiseError("Failed to open project file.", error);
		return false;
	}
}

export function openProjectBrowser() {
	return openProjectFile();
}

export function openRelinkMediaDialog(modalProps: Record<string, unknown> = {}) {
	showModal("RelinkMediaDialog", {
		title: "Relink Media",
		...modalProps,
	});
}

export async function listProjects() {
	return [];
}

export async function loadProjectById(_projectId: string) {
	raiseError("Cloud projects were removed.", new Error("Use Open project."));
}

export async function renameProjectById(_projectId: string, _name: string) {
	raiseError(
		"Cloud projects were removed.",
		new Error("Use Save project to download a new file."),
	);
	return null;
}

export async function deleteProjectById(_projectId: string) {
	raiseError(
		"Cloud projects were removed.",
		new Error("Use your file system to delete local project files."),
	);
}

export async function saveProject(nameOverride?: string) {
	const state = projectStore.getState();
	const name = (
		nameOverride ||
		state.projectName ||
		DEFAULT_PROJECT_NAME
	).trim();

	try {
		const { snapshot, mediaRefs } = prepareSnapshotMediaForSave(
			snapshotProject(),
		);
		const payload = {
			name,
			projectName: name,
			version: env.APP_VERSION,
			savedAt: new Date().toISOString(),
			snapshot,
			mediaRefs,
		};
		const fileName = createProjectFileName(name);
		const { fileHandle, filePath, canceled } = await api.showSaveDialog({
			defaultPath: fileName,
			filters: PROJECT_FILE_FILTERS,
		});

		if (canceled) {
			return false;
		}

		const target = fileHandle || filePath || fileName;
		await api.saveTextFile(target, JSON.stringify(payload, null, 2), {
			mimeType: "application/json",
			fileName,
		});

		projectStore.setState({
			projectId: null,
			projectName: name,
			opened: Date.now(),
			lastModified: 0,
			unresolvedMediaRefs: [],
		});

		logger.log("Project saved locally:", fileName);
		return true;
	} catch (error) {
		raiseError("Failed to save project file.", error);
		return false;
	}
}

export async function relinkMediaRef(mediaRef: MediaRef) {
	try {
		const isVideo = mediaRef.kind === "video";
		const filters = isVideo
			? [{ name: "Video files", extensions: ["mp4", "webm", "ogv"] }]
			: [{ name: "Image files", extensions: ["jpg", "jpeg", "png", "gif"] }];
		const { files, canceled } = await api.showOpenDialog({ filters });

		if (canceled || !files || !files.length) {
			return;
		}

		const file = files[0];
		const sourcePath = getFilePath(file);
		const src = sourcePath
			? toFileUrl(sourcePath)
			: isVideo
				? await api.readVideoFile(file)
				: await api.readImageFile(file);

		updateElementProperty(mediaRef.displayId, "src", src);
		updateElementProperty(mediaRef.displayId, "sourcePath", sourcePath || "");

		setUnresolvedMediaRefs(
			projectStore
				.getState()
				.unresolvedMediaRefs.filter(
					(ref) => ref.displayId !== mediaRef.displayId,
				),
		);
	} catch (error) {
		raiseError("Failed to relink media.", error);
	}
}

export function clearUnresolvedMedia() {
	setUnresolvedMediaRefs([]);
}

export default projectStore;
