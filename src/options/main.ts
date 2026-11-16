import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { OptionsComponent } from './options.component';

void bootstrapApplication(OptionsComponent, {
  providers: [provideZonelessChangeDetection()],
});
