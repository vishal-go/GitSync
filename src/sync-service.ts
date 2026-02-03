import { App, TFile, TFolder, Notice, normalizePath } from 'obsidian';
import { GitHubAPI } from './github-api';
import { GitSyncSettings, SyncResult, GitHubFile } from './types';

export class SyncService {
	private app: App;
	private settings: GitSyncSettings;
	private api: GitHubAPI | null = null;
	private isSyncing: boolean = false;

	constructor(app: App, settings: GitSyncSettings) {
		this.app = app;
		this.settings = settings;
		this.initializeAPI();
	}

	updateSettings(settings: GitSyncSettings): void {
		this.settings = settings;
		this.initializeAPI();
	}

	private initializeAPI(): void {
		if (this.settings.githubUsername && this.settings.githubToken && this.settings.repositoryName) {
			this.api = new GitHubAPI(
				this.settings.githubUsername,
				this.settings.githubToken,
				this.settings.repositoryName,
				this.settings.branch
			);
		} else {
			this.api = null;
		}
	}

	isConfigured(): boolean {
		return this.api !== null;
	}

	isBusy(): boolean {
		return this.isSyncing;
	}

	/**
	 * Verify GitHub connection
	 */
	async verifyConnection(): Promise<boolean> {
		if (!this.api) {
			return false;
		}
		return await this.api.verifyAccess();
	}

	/**
	 * Get all vault files (excluding configured folders/files)
	 */
	private async getVaultFiles(): Promise<TFile[]> {
		const allFiles = this.app.vault.getFiles();
		
		return allFiles.filter(file => {
			// Check excluded folders
			for (const folder of this.settings.excludedFolders) {
				if (file.path.startsWith(folder)) {
					return false;
				}
			}

			// Check excluded files
			for (const excludedFile of this.settings.excludedFiles) {
				if (file.name === excludedFile || file.path.endsWith(excludedFile)) {
					return false;
				}
			}

			return true;
		});
	}

	/**
	 * Get file content as string (handles binary files)
	 */
	private async getFileContent(file: TFile): Promise<string> {
		// For binary files, read as base64
		const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.mp3', '.mp4', '.webp', '.svg', '.ico'];
		const isBinary = binaryExtensions.some(ext => file.extension.toLowerCase() === ext.slice(1));

		if (isBinary) {
			const arrayBuffer = await this.app.vault.readBinary(file);
			const bytes = new Uint8Array(arrayBuffer);
			let binary = '';
			for (let i = 0; i < bytes.length; i++) {
				binary += String.fromCharCode(bytes[i] as number);
			}
			return `[BINARY:${btoa(binary)}]`;
		}

		return await this.app.vault.read(file);
	}

	/**
	 * Write file content (handles binary files)
	 */
	private async writeFileContent(path: string, content: string): Promise<void> {
		const normalizedPath = normalizePath(path);

		// Check if it's binary content
		if (content.startsWith('[BINARY:') && content.endsWith(']')) {
			const base64 = content.slice(8, -1);
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			
			// Ensure parent folder exists
			await this.ensureFolder(normalizedPath);
			
			const existingFile = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (existingFile instanceof TFile) {
				await this.app.vault.modifyBinary(existingFile, bytes.buffer);
			} else {
				await this.app.vault.createBinary(normalizedPath, bytes.buffer);
			}
		} else {
			// Ensure parent folder exists
			await this.ensureFolder(normalizedPath);
			
			const existingFile = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, content);
			} else {
				await this.app.vault.create(normalizedPath, content);
			}
		}
	}

	/**
	 * Ensure folder exists for a file path
	 */
	private async ensureFolder(filePath: string): Promise<void> {
		const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
		if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	/**
	 * Generate commit message with date placeholder
	 */
	private getCommitMessage(): string {
		const now = new Date();
		const dateStr = now.toISOString().replace('T', ' ').split('.')[0] ?? '';
		return this.settings.commitMessage.replace('{{date}}', dateStr);
	}

	/**
	 * Push local changes to GitHub
	 */
	async push(): Promise<SyncResult> {
		if (!this.api) {
			return { success: false, message: 'GitHub not configured', filesUploaded: 0, filesDownloaded: 0, filesDeleted: 0 };
		}

		if (this.isSyncing) {
			return { success: false, message: 'Sync already in progress', filesUploaded: 0, filesDownloaded: 0, filesDeleted: 0 };
		}

		this.isSyncing = true;

		try {
			new Notice('GitSync: Pushing to GitHub...');

			// Ensure repository exists
			const repoExists = await this.api.ensureRepository();
			if (!repoExists) {
				throw new Error('Could not access or create repository');
			}

			// Get all vault files
			const vaultFiles = await this.getVaultFiles();
			
			// Prepare files for batch upload
			const filesToUpload: Array<{ path: string; content: string }> = [];

			for (const file of vaultFiles) {
				const content = await this.getFileContent(file);
				filesToUpload.push({
					path: file.path,
					content
				});
			}

			if (filesToUpload.length === 0) {
				return { success: true, message: 'No files to push', filesUploaded: 0, filesDownloaded: 0, filesDeleted: 0 };
			}

			// Batch upload all files
			const success = await this.api.batchUpload(filesToUpload, this.getCommitMessage());

			if (success) {
				new Notice(`GitSync: Pushed ${filesToUpload.length} files to GitHub`);
				return {
					success: true,
					message: `Successfully pushed ${filesToUpload.length} files`,
					filesUploaded: filesToUpload.length,
					filesDownloaded: 0,
					filesDeleted: 0
				};
			} else {
				throw new Error('Failed to push files to GitHub');
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`GitSync: Push failed - ${message}`);
			return { success: false, message, filesUploaded: 0, filesDownloaded: 0, filesDeleted: 0 };
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Pull changes from GitHub
	 */
	async pull(): Promise<SyncResult> {
		if (!this.api) {
			return { success: false, message: 'GitHub not configured', filesUploaded: 0, filesDownloaded: 0, filesDeleted: 0 };
		}

		if (this.isSyncing) {
			return { success: false, message: 'Sync already in progress', filesUploaded: 0, filesDownloaded: 0, filesDeleted: 0 };
		}

		this.isSyncing = true;

		try {
			new Notice('GitSync: Pulling from GitHub...');

			// Get all files from GitHub
			const remoteFiles = await this.api.getAllFiles();
			let filesDownloaded = 0;

			for (const remoteFile of remoteFiles) {
				// Check if file should be excluded
				let shouldSkip = false;
				for (const folder of this.settings.excludedFolders) {
					if (remoteFile.path.startsWith(folder)) {
						shouldSkip = true;
						break;
					}
				}
				for (const excludedFile of this.settings.excludedFiles) {
					if (remoteFile.path.endsWith(excludedFile)) {
						shouldSkip = true;
						break;
					}
				}

				if (shouldSkip) continue;

				// Get remote file content
				const content = await this.api.getFileContent(remoteFile.path);
				if (content !== null) {
					await this.writeFileContent(remoteFile.path, content);
					filesDownloaded++;
				}
			}

			new Notice(`GitSync: Pulled ${filesDownloaded} files from GitHub`);
			return {
				success: true,
				message: `Successfully pulled ${filesDownloaded} files`,
				filesUploaded: 0,
				filesDownloaded,
				filesDeleted: 0
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`GitSync: Pull failed - ${message}`);
			return { success: false, message, filesUploaded: 0, filesDownloaded: 0, filesDeleted: 0 };
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Full sync (push local changes then pull remote changes)
	 */
	async sync(): Promise<SyncResult> {
		if (!this.api) {
			return { success: false, message: 'GitHub not configured', filesUploaded: 0, filesDownloaded: 0, filesDeleted: 0 };
		}

		if (this.isSyncing) {
			return { success: false, message: 'Sync already in progress', filesUploaded: 0, filesDownloaded: 0, filesDeleted: 0 };
		}

		this.isSyncing = true;

		try {
			new Notice('GitSync: Starting sync...');

			// Ensure repository exists
			const repoExists = await this.api.ensureRepository();
			if (!repoExists) {
				throw new Error('Could not access or create repository');
			}

			// Get all files from both sources
			const vaultFiles = await this.getVaultFiles();
			const remoteFiles = await this.api.getAllFiles();

			// Create maps for comparison
			const vaultFileMap = new Map<string, TFile>();
			for (const file of vaultFiles) {
				vaultFileMap.set(file.path, file);
			}

			const remoteFileMap = new Map<string, GitHubFile>();
			for (const file of remoteFiles) {
				remoteFileMap.set(file.path, file);
			}

			let filesUploaded = 0;
			let filesDownloaded = 0;

			// Upload local files that are newer or don't exist remotely
			const filesToUpload: Array<{ path: string; content: string }> = [];

			for (const file of vaultFiles) {
				const content = await this.getFileContent(file);
				filesToUpload.push({
					path: file.path,
					content
				});
				filesUploaded++;
			}

			if (filesToUpload.length > 0) {
				const uploadSuccess = await this.api.batchUpload(filesToUpload, this.getCommitMessage());
				if (!uploadSuccess) {
					throw new Error('Failed to upload files');
				}
			}

			// Download remote files that don't exist locally
			for (const [path, remoteFile] of remoteFileMap) {
				// Check exclusions
				let shouldSkip = false;
				for (const folder of this.settings.excludedFolders) {
					if (path.startsWith(folder)) {
						shouldSkip = true;
						break;
					}
				}
				if (shouldSkip) continue;

				if (!vaultFileMap.has(path)) {
					const content = await this.api.getFileContent(path);
					if (content !== null) {
						await this.writeFileContent(path, content);
						filesDownloaded++;
					}
				}
			}

			new Notice(`GitSync: Synced ${filesUploaded} up, ${filesDownloaded} down`);
			return {
				success: true,
				message: `Sync complete: ${filesUploaded} uploaded, ${filesDownloaded} downloaded`,
				filesUploaded,
				filesDownloaded,
				filesDeleted: 0
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`GitSync: Sync failed - ${message}`);
			return { success: false, message, filesUploaded: 0, filesDownloaded: 0, filesDeleted: 0 };
		} finally {
			this.isSyncing = false;
		}
	}
}
