import AsyncStorage from '@react-native-async-storage/async-storage';
import { setStorageBackend } from './store';

setStorageBackend(AsyncStorage);

export { favourites, MAX_FAVOURITES } from './favourites';
export { recent, MAX_RECENT } from './recent';
export { settings, DEFAULT_SETTINGS, type Settings, type ThemeChoice } from './settings';
export { useStored } from './useStored';
export { isValidPage } from './pages';
