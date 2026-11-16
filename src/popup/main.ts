import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { PopupComponent } from './popup.component';

void bootstrapApplication(PopupComponent, {
  providers: [provideZonelessChangeDetection()],
});
