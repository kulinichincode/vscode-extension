import * as vscode from "vscode";
import DeepCode from "../../../interfaces/DeepCodeInterfaces";
import { errorsLogs } from "../../messages/errorsServerLogMessages";

class DeepCodeEditorsWatcher implements DeepCode.DeepCodeWatcherInterface {
  private currentTextEditors: {
    [key: string]: DeepCode.openedTextEditorType;
  } = {};

  private createEditorInfo(
    extension: DeepCode.ExtensionInterface,
    editor: vscode.TextEditor
  ): void {
    const path = editor.document.fileName;
    const workspacePath = extension.workspacesPaths.find(p =>
      editor.document.fileName.includes(p)
    );
    this.currentTextEditors[editor.document.fileName] = {
      fullPath: path,
      workspace: workspacePath || "",
      filePathInWorkspace: workspacePath
        ? editor.document.fileName.split(workspacePath)[1]
        : "",
      lineCount: {
        current: editor.document.lineCount,
        prevOffset: 0
      },
      contentChanges: [],
      document: editor.document
    };
  }

  private watchEditorsNavChange(extension: DeepCode.ExtensionInterface) {
    vscode.window.onDidChangeActiveTextEditor(
      (editor: vscode.TextEditor | undefined) => {
        if (editor && !this.currentTextEditors[editor.document.fileName]) {
          this.createEditorInfo(extension, editor);
        }
      }
    );
  }

  private watchClosingEditor() {
    vscode.workspace.onDidCloseTextDocument((document: vscode.TextDocument) => {
      delete this.currentTextEditors[document.fileName];
    });
  }

  private watchEditorCodeChanges(extension: DeepCode.ExtensionInterface) {
    vscode.workspace.onDidChangeTextDocument(
      (event: vscode.TextDocumentChangeEvent) => {
        try {
          const currentEditorFileName = event.document.fileName;
          if (
            this.currentTextEditors[currentEditorFileName] &&
            event.contentChanges &&
            event.contentChanges.length
          ) {
            const curentLineCount = this.currentTextEditors[
              currentEditorFileName
            ].lineCount.current;
            this.currentTextEditors[currentEditorFileName] = {
              ...this.currentTextEditors[currentEditorFileName],
              lineCount: {
                current: event.document.lineCount,
                prevOffset: event.document.lineCount - curentLineCount
              },
              contentChanges: [...event.contentChanges],
              document: event.document
            };
            extension.analyzer.updateReviewResultsPositions(
              extension,
              this.currentTextEditors[currentEditorFileName]
            );
          }
        } catch (err) {
          const workspacePath = Object.keys(extension.remoteBundles).find(
            bundlePath => event.document.fileName.includes(bundlePath)
          );
          extension.errorHandler.sendErrorToServer(extension, err, {
            errorDetails: {
              message: errorsLogs.vscodeFileChanges,
              bundleId: workspacePath
                ? extension.remoteBundles[workspacePath].bundleId
                : "",
              data: {
                ...(workspacePath && {
                  [event.document.fileName.split(workspacePath)[1]]:
                    event.contentChanges
                })
              }
            }
          });
        }
      }
    );
  }

  private async prepareWatchers(
    extension: DeepCode.ExtensionInterface
  ): Promise<void> {
    for await (const editor of vscode.window.visibleTextEditors) {
      this.createEditorInfo(extension, editor);
    }
    await this.watchEditorsNavChange(extension);
    await this.watchClosingEditor();
    await this.watchEditorCodeChanges(extension);
  }

  public activate(extension: DeepCode.ExtensionInterface): void {
    this.prepareWatchers(extension);
  }
}

export default DeepCodeEditorsWatcher;
