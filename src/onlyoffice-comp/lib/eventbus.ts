// EventBus 实现
export type SaveDocumentData = {
  fileName: string;
  fileType: string;
  binData: Uint8Array;
};

const saveEventBus = {
  listeners: [] as Array<(data: SaveDocumentData) => void>,
  on(callback: (data: SaveDocumentData) => void) {
    this.listeners.push(callback);
  },
  off(callback: (data: SaveDocumentData) => void) {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  },
  emit(data: SaveDocumentData) {
    this.listeners.forEach(listener => listener(data));
  },
};

export { saveEventBus };

