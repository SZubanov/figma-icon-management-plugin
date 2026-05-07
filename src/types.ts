export interface IconSetMetadata {
  name: string;
  sizes: string[];
  tags: string[];
  styles: string[];
  categories: string[];
}

export interface SelectionData {
  nodeId: string;
  nodeName: string;
  metadata: IconSetMetadata;
}

export interface ReleaseSummary {
  created: number;
  updated: number;
  removed: number;
}

export type UIMessage =
  | { type: 'GET_SELECTION' }
  | { type: 'SAVE_METADATA'; nodeId: string; metadata: IconSetMetadata }
  | { type: 'RELEASE' }
  | { type: 'REMOVE_ICONSET'; nodeId: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; rootFrameName: string }
  | { type: 'CLOSE_PLUGIN' };

export type PluginMessage =
  | { type: 'SELECTION_DATA'; data: SelectionData }
  | { type: 'NO_SELECTION' }
  | { type: 'INVALID_SELECTION' }
  | { type: 'SAVE_DONE' }
  | { type: 'RELEASE_PROGRESS'; step: string }
  | { type: 'RELEASE_DONE'; summary: ReleaseSummary }
  | { type: 'RELEASE_ERROR'; message: string }
  | { type: 'REMOVE_DONE' }
  | { type: 'SETTINGS_DATA'; rootFrameName: string }
  | { type: 'SETTINGS_SAVED' };

export const ROOT_FRAME_NAME_DEFAULT = 'По назначению';
export const UNCATEGORIZED_FRAME_NAME = 'НОВЫЕ ИКОНКИ';
