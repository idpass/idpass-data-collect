import { OpenFnSyncAdapter } from '../openfn/OpenFnSyncAdapter';
import { EventStore, EventApplierService, ExternalSyncConfig, FormSubmission, SyncLevel } from '../../interfaces/types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenFnSyncAdapter', () => {
  let adapter: OpenFnSyncAdapter;
  let eventStore: jest.Mocked<EventStore>;
  let eventApplierService: jest.Mocked<EventApplierService>;
  let config: ExternalSyncConfig;

  beforeEach(() => {
    eventStore = {
      getLastPullExternalSyncTimestamp: jest.fn(),
      setLastPullExternalSyncTimestamp: jest.fn(),
      getLastPushExternalSyncTimestamp: jest.fn(),
      setLastPushExternalSyncTimestamp: jest.fn(),
      getEventsSince: jest.fn(),
    } as unknown as jest.Mocked<EventStore>;

    eventApplierService = {
      submitForm: jest.fn(),
    } as unknown as jest.Mocked<EventApplierService>;

    config = {
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

      expect(eventApplierService.submitForm).toHaveBeenCalledTimes(2);

      const firstCall = eventApplierService.submitForm.mock.calls[0][0] as FormSubmission;
      expect(firstCall.type).toBe('create-individual');
      expect(firstCall.data.name).toBe('John Doe');
      expect(firstCall.syncLevel).toBe(SyncLevel.REMOTE);

      const secondCall = eventApplierService.submitForm.mock.calls[1][0] as FormSubmission;
      expect(secondCall.type).toBe('update-individual');
      expect(secondCall.entityGuid).toBe('person1');
      expect(secondCall.data.age).toBe(30);
      expect(secondCall.syncLevel).toBe(SyncLevel.REMOTE);

      expect(eventStore.setLastPullExternalSyncTimestamp).toHaveBeenCalledWith('2025-09-24T11:00:00.000Z');
    });
  });
});
