import axios from 'axios';

import OpenFnSyncAdapter from '../openfn/OpenFnSyncAdapter';
import type { EventStore, ExternalSyncConfig, FormSubmission } from '../../interfaces/types';
import { SyncLevel } from '../../interfaces/types';
import type { EventApplierService } from '../../services/EventApplierService';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenFnSyncAdapter', () => {
  let adapter: OpenFnSyncAdapter;
  let eventStore: jest.Mocked<EventStore>;
  let eventApplierService: EventApplierService;
  let submitFormMock: jest.MockedFunction<EventApplierService["submitForm"]>;
  let config: ExternalSyncConfig;

  beforeEach(() => {
    eventStore = {
      getLastPullExternalSyncTimestamp: jest.fn(),
      setLastPullExternalSyncTimestamp: jest.fn(),
      getLastPushExternalSyncTimestamp: jest.fn(),
      setLastPushExternalSyncTimestamp: jest.fn(),
      getEventsSince: jest.fn(),
    } as unknown as jest.Mocked<EventStore>;

    submitFormMock = jest.fn();
    eventApplierService = {
      submitForm: submitFormMock,
    } as unknown as EventApplierService;

    config = {
      type: 'openfn',
      url: 'http://openfn.org/inbox/123',
      extraFields: [{ name: 'apiKey', value: 'test-key' }],
    };

    adapter = new OpenFnSyncAdapter(eventStore, eventApplierService, config);
  });

  describe('pullData', () => {
    it('should fetch data from OpenFn, convert it to events, and apply them to the event store', async () => {
      const mockApiResponse = {
        events: [
          {
            id: 'evt1',
            type: 'create-individual',
            timestamp: '2025-09-24T10:00:00.000Z',
            data: { name: 'John Doe' },
          },
          {
            id: 'evt2',
            type: 'update-individual',
            entityGuid: 'person1',
            timestamp: '2025-09-24T11:00:00.000Z',
            data: { age: 30 },
          },
        ],
      };

      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });
      eventStore.getLastPullExternalSyncTimestamp.mockResolvedValue('2025-09-24T09:00:00.000Z');

      await adapter.pullData();

      expect(mockedAxios.get).toHaveBeenCalledWith('http://openfn.org/inbox/123', {
        headers: { 'X-Api-Key': 'test-key' },
        params: { since: '2025-09-24T09:00:00.000Z' },
      });

      expect(submitFormMock).toHaveBeenCalledTimes(2);

      const firstCall = submitFormMock.mock.calls[0][0] as FormSubmission;
      expect(firstCall.type).toBe('create-individual');
      expect(firstCall.data).toMatchObject({ data: { name: 'John Doe' } });
      expect(firstCall.syncLevel).toBe(SyncLevel.REMOTE);

      const secondCall = submitFormMock.mock.calls[1][0] as FormSubmission;
      expect(secondCall.type).toBe('update-individual');
      expect(secondCall.entityGuid).toBe('person1');
      expect(secondCall.data).toMatchObject({ data: { age: 30 } });
      expect(secondCall.syncLevel).toBe(SyncLevel.REMOTE);

      expect(eventStore.setLastPullExternalSyncTimestamp).toHaveBeenCalledWith('2025-09-24T11:00:00.000Z');
    });
  });
});
