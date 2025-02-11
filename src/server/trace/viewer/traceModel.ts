/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import path from 'path';
import * as trace from '../common/traceEvents';
import { ContextResources, ResourceSnapshot } from '../../snapshot/snapshotTypes';
import { BaseSnapshotStorage, SnapshotStorage } from '../../snapshot/snapshotStorage';
import { BrowserContextOptions } from '../../types';
export * as trace from '../common/traceEvents';

export class TraceModel {
  contextEntry: ContextEntry;
  pageEntries = new Map<string, PageEntry>();
  contextResources = new Map<string, ContextResources>();
  private _snapshotStorage: PersistentSnapshotStorage;

  constructor(snapshotStorage: PersistentSnapshotStorage) {
    this._snapshotStorage = snapshotStorage;
    this.contextEntry = {
      startTime: Number.MAX_VALUE,
      endTime: Number.MIN_VALUE,
      browserName: '',
      options: { sdkLanguage: '' },
      pages: [],
      resources: []
    };
  }

  appendEvents(events: trace.TraceEvent[], snapshotStorage: SnapshotStorage) {
    for (const event of events)
      this.appendEvent(event);
    const actions: trace.ActionTraceEvent[] = [];
    for (const page of this.contextEntry!.pages)
      actions.push(...page.actions);
    this.contextEntry!.resources = snapshotStorage.resources();
  }

  private _pageEntry(pageId: string): PageEntry {
    let pageEntry = this.pageEntries.get(pageId);
    if (!pageEntry) {
      pageEntry = {
        actions: [],
        events: [],
        screencastFrames: [],
      };
      this.pageEntries.set(pageId, pageEntry);
      this.contextEntry.pages.push(pageEntry);
    }
    return pageEntry;
  }

  appendEvent(event: trace.TraceEvent) {
    switch (event.type) {
      case 'context-options': {
        this.contextEntry.browserName = event.browserName;
        this.contextEntry.options = event.options;
        break;
      }
      case 'screencast-frame': {
        this._pageEntry(event.pageId).screencastFrames.push(event);
        break;
      }
      case 'action': {
        const metadata = event.metadata;
        if (metadata.pageId)
          this._pageEntry(metadata.pageId).actions.push(event);
        break;
      }
      case 'event': {
        const metadata = event.metadata;
        if (metadata.pageId)
          this._pageEntry(metadata.pageId).events.push(event);
        break;
      }
      case 'resource-snapshot':
        this._snapshotStorage.addResource(event.snapshot);
        break;
      case 'frame-snapshot':
        this._snapshotStorage.addFrameSnapshot(event.snapshot);
        break;
    }
    if (event.type === 'action' || event.type === 'event') {
      this.contextEntry!.startTime = Math.min(this.contextEntry!.startTime, event.metadata.startTime);
      this.contextEntry!.endTime = Math.max(this.contextEntry!.endTime, event.metadata.endTime);
    }
  }
}

export type ContextEntry = {
  startTime: number;
  endTime: number;
  browserName: string;
  options: BrowserContextOptions;
  pages: PageEntry[];
  resources: ResourceSnapshot[];
}

export type PageEntry = {
  actions: trace.ActionTraceEvent[];
  events: trace.ActionTraceEvent[];
  screencastFrames: {
    sha1: string,
    timestamp: number,
    width: number,
    height: number,
  }[]
}

export class PersistentSnapshotStorage extends BaseSnapshotStorage {
  private _resourcesDir: string;

  constructor(resourcesDir: string) {
    super();
    this._resourcesDir = resourcesDir;
  }

  resourceContent(sha1: string): Buffer | undefined {
    return fs.readFileSync(path.join(this._resourcesDir, sha1));
  }
}
